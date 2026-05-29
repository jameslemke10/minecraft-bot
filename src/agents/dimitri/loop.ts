import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../../logger.js'
import type { Metrics } from '../../llm/metrics.js'
import type { RunLog } from '../run-log.js'
import type { Body } from '../../body/types.js'
import type { Action, Percept, WorldEvent } from '../../body/minecraft/general/index.js'
import type { Task } from '../../task/types.js'
import type { ObserverDashboard } from '../../observer/dashboard.js'
import type { WorkingMemory, HistoryEntry } from './wm.js'
import { curate } from './curator.js'
import { hydrate } from './hydrate.js'
import { decide } from './executive.js'

export interface DimitriLoopOptions {
  task: Task
  metrics: Metrics
  runLog: RunLog
  observer?: ObserverDashboard
  maxTicks?: number
  /** End the run if the milestone hasn't advanced in this many ticks. */
  stallLimit?: number
  /** Aborts the loop cleanly (e.g. on Ctrl+C). */
  signal?: AbortSignal
}

/**
 * Dimitri's conscious loop: sense → curator (select+GC) → hydrate → executive
 * (think/note/act) → execute. Curator manages context; executive does cognition.
 */
export async function runDimitri(
  body: Body<Action, Percept>,
  wm: WorkingMemory,
  opts: DimitriLoopOptions
): Promise<void> {
  const { task, metrics, runLog, observer, maxTicks, stallLimit = 60, signal } = opts
  const progressPath = join(runLog.runDir, 'progress.jsonl')

  let tick = 0
  let bestScore = -1
  let ticksSinceProgress = 0

  while (maxTicks === undefined || tick < maxTicks) {
    if (signal?.aborted) {
      logger.info({ tick }, 'Dimitri loop aborted')
      break
    }
    try {
      // 1. Sense (reflects all prior actions).
      observer?.setPhase('sensing')
      const percept = await body.sense()
      observer?.publish(perceptSnapshot(tick, percept, task, wm))

      // 2. Harness folds world-events into history.
      for (const ev of percept.new_events) wm.addEvent(tick, renderEvent(ev))

      // 3. Progress / completion / trap checks.
      const prog = task.progress(percept)
      if (prog.score > bestScore) {
        bestScore = prog.score
        ticksSinceProgress = 0
      } else {
        ticksSinceProgress++
      }
      logProgress(progressPath, { tick, score: prog.score, label: prog.label, history: wm.history.length, notes: wm.notes.length })

      if (task.isComplete(percept)) {
        logger.info({ tick, label: prog.label }, 'Dimitri completed the task')
        break
      }
      if (ticksSinceProgress >= stallLimit) {
        logger.warn({ tick, bestScore, stallLimit }, 'Dimitri stalled — ending run (trap detector)')
        break
      }

      // 4. Curator: select + GC (ids only).
      observer?.setPhase('curating')
      const { pass, remove } = await curate(wm, percept, metrics, runLog)

      // 5. Hydrate against current WM (before removal), then apply GC.
      const { context, verbs } = hydrate(pass, wm, percept)
      if (remove.length) wm.remove(remove)
      observer?.publish({ curator: { pass, remove }, verbs })

      // 6. Executive: think / note / act.
      observer?.setPhase('deciding')
      const exec = await decide(context, verbs, tick, metrics, runLog)
      wm.addThought(tick, exec.thought)
      for (const note of exec.notes_to_add) wm.addNote(tick, note)
      logger.info(
        { tick, thought: exec.thought, action: exec.action, pass: pass.length, remove: remove.length, verbs },
        'Dimitri thinks'
      )

      // 7. Act.
      observer?.publish({
        thought: exec.thought,
        action: exec.action ?? undefined,
        recentHistory: formatRecentHistory(wm.recentHistory(8)),
      })
      let outcome: { ok: boolean; message: string }
      if (exec.action) {
        wm.addAction(tick, exec.action)
        observer?.setPhase('acting', actionLabel(exec.action))
        outcome = await body.execute(exec.action)
        wm.addOutcome(tick, exec.action.kind, outcome.ok, outcome.message)
      } else {
        outcome = { ok: false, message: 'no valid action chosen' }
        wm.addOutcome(tick, 'none', false, outcome.message)
      }
      observer?.publish({
        outcome,
        recentHistory: formatRecentHistory(wm.recentHistory(8)),
        phase: 'idle',
        phaseDetail: undefined,
      })

      runLog.recordTick({
        tick,
        thought: exec.thought,
        action: exec.action,
        action_outcome: outcome,
      })

      wm.persist()
    } catch (err) {
      logger.error({ tick, err: String(err) }, 'Dimitri tick failed — skipping')
    }
    tick++
  }

  wm.persist()
  logger.info({ ticks: tick, bestScore }, 'Dimitri run ended')
}

function renderEvent(e: WorldEvent): string {
  switch (e.kind) {
    case 'damage':
      return `damage ${e.amount} from ${e.source}`
    case 'chat':
      return `chat <${e.sender}> ${e.text}`
    case 'change':
      return e.text
  }
}

function logProgress(
  path: string,
  row: { tick: number; score: number; label: string; history: number; notes: number }
): void {
  try {
    appendFileSync(path, JSON.stringify(row) + '\n')
  } catch {
    /* best effort */
  }
}

function perceptSnapshot(
  tick: number,
  percept: Percept,
  task: Task,
  wm: WorkingMemory
): Parameters<ObserverDashboard['publish']>[0] {
  const inv = aggregateInventory(percept.self.inventory)
  return {
    tick,
    milestone: task.progress(percept),
    self: {
      position: percept.self.position,
      health: percept.self.health,
      food: percept.self.food,
      held_item: percept.self.held_item,
      inventory: inv,
    },
    recentHistory: formatRecentHistory(wm.recentHistory(8)),
  }
}

function aggregateInventory(
  items: Percept['self']['inventory']
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it.name, (counts.get(it.name) ?? 0) + it.count)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function formatRecentHistory(entries: readonly HistoryEntry[]): string[] {
  return entries.map((e) => {
    switch (e.kind) {
      case 'thought':
        return `[t${e.tick} thought] ${truncate(e.text, 120)}`
      case 'action':
        return `[t${e.tick} action] ${actionLabel(e.action)}`
      case 'outcome':
        return `[t${e.tick} outcome] ${e.actionKind} → ${e.ok ? 'ok' : 'fail'}: ${e.message}`
      case 'event':
        return `[t${e.tick} event] ${e.text}`
    }
  })
}

function actionLabel(action: Action): string {
  return `${action.kind}(${JSON.stringify(action.args)})`
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}
