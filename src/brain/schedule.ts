import type { ActionDoc, Body, RawPercept, SceneObject } from '../body/types.js'
import type {
  Action,
  EventLogEntry,
  FocusItem,
  FocusRef,
  ThalamusOutput,
} from './types.js'
import { logger } from '../logger.js'
import { metrics } from '../llm/metrics.js'
import { Workspace, selfFromPercept } from './workspace.js'
import { attention } from './attention.js'
import { executive } from './executive.js'

const METRICS_EVERY_TICKS = 10

export interface BrainLoopOptions {
  /** Stop after N ticks. Omit for unbounded. */
  maxTicks?: number
  /** Pause inserted after EACH brain processor. Default 0. */
  postProcessorDelayMs?: number
}

/**
 * The conscious loop: sense → Thalamus → hydrate focus → PFC → act.
 * Serial in v1. The Thalamus produces a tiny ThalamusOutput (refs + actions
 * + brief); the schedule hydrates the refs into FocusItems before calling
 * the PFC so the PFC sees original structured data, not paraphrased text.
 */
export async function runBrain(
  body: Body<Action>,
  workspace: Workspace,
  opts: BrainLoopOptions = {}
): Promise<void> {
  const { maxTicks, postProcessorDelayMs = 0 } = opts
  const actionMenu = body.describeActions()
  // Resume from where the persisted WM left off so tick numbers stay
  // monotonic across restarts. Fresh WM has lastTick=0 → start at 0.
  let tick = workspace.lastTick > 0 ? workspace.lastTick + 1 : 0
  const startTick = tick

  while (maxTicks === undefined || tick - startTick < maxTicks) {
    try {
      // 1. Sense
      const percept = await body.sense()
      workspace.updateSelfAndTick(selfFromPercept(percept), tick)

      // Pump any events the body observed since last sense() into the WM log.
      for (const ev of percept.new_events) {
        // The body stamped ticks at drain-time but they may be stale (one
        // tick behind in fast-loops). Re-stamp with the current brain tick.
        workspace.appendEvent({ ...ev, tick })
      }

      // 2. Thalamus: percept + WM slice → ThalamusOutput
      const slice = workspace.sliceForThalamus()
      const att = await attention({
        percept,
        intention: slice.intention,
        recent_events: slice.recent_events,
        action_menu: actionMenu,
      })
      logger.info(
        {
          tick,
          focus: att.focus_refs.map((r) => `${refLabel(r)} — ${r.why}`),
          actions_in_play: att.actions_in_play,
          brief: att.brief,
        },
        'Atticus notices'
      )
      if (postProcessorDelayMs > 0) await sleep(postProcessorDelayMs)

      // 3. Hydrate refs into full FocusItems
      const focus = hydrateFocus(percept, workspace.eventLog, att.focus_refs)
      const menu = filterActionMenu(actionMenu, att.actions_in_play)

      // 4. PFC: focus + WM slice + filtered menu → Decision
      const exec = await executive({
        focus,
        self: selfFromPercept(percept),
        intention: slice.intention,
        recent_events: slice.recent_events,
        action_menu: menu,
        ...(att.brief ? { brief: att.brief } : {}),
        tick,
      })
      workspace.appendEvent(exec.thought)
      workspace.setIntention(exec.intention)
      logger.info(
        { tick, thought: exec.thought.text, intention: exec.intention, action: exec.action },
        'Atticus thinks'
      )
      if (postProcessorDelayMs > 0) await sleep(postProcessorDelayMs)

      // 5. Act
      if (exec.action) {
        workspace.appendEvent({ kind: 'action', tick, action: exec.action })
        await body.execute(exec.action)
      }
    } catch (err) {
      logger.error({ err: String(err), tick }, 'brain tick failed — skipping')
    }

    if ((tick - startTick + 1) % METRICS_EVERY_TICKS === 0) {
      logger.info(metrics.summary(), 'run metrics (running total)')
    }

    tick++
  }
}

// --- Focus hydration: resolve refs against the original percept + event log ---

export function hydrateFocus(
  percept: RawPercept,
  eventLog: readonly EventLogEntry[],
  refs: readonly FocusRef[]
): FocusItem[] {
  const out: FocusItem[] = []
  for (const r of refs) {
    const item = resolveRef(percept, eventLog, r)
    if (item) out.push(item)
    else logger.warn({ ref: r }, 'focus ref unresolved — dropping')
  }
  return out
}

function resolveRef(
  percept: RawPercept,
  eventLog: readonly EventLogEntry[],
  r: FocusRef
): FocusItem | null {
  switch (r.source) {
    case 'scene.objects': {
      const obj = findSceneObject(percept.scene.objects, r.id)
      if (!obj) return null
      return {
        source: 'scene.objects',
        ref: `scene.objects/${String(obj.id)}`,
        data: obj,
        why: r.why,
      }
    }
    case 'entities': {
      const id = typeof r.id === 'string' ? Number(r.id) : r.id
      const e = percept.nearby_entities.find((x) => x.id === id)
      if (!e) return null
      return { source: 'entities', ref: `entities/${id}`, data: e, why: r.why }
    }
    case 'events': {
      // Match on tick + kind. If only kind given, take the most recent.
      const matches = eventLog.filter((e) => {
        if (r.kind && e.kind !== r.kind) return false
        if (typeof r.tick === 'number' && e.tick !== r.tick) return false
        return true
      })
      const e = matches.at(-1)
      if (!e) return null
      return {
        source: 'events',
        ref: `events/t${e.tick}:${e.kind}`,
        data: e,
        why: r.why,
      }
    }
    case 'self': {
      const field = String(r.id ?? '')
      const self = percept.self as unknown as Record<string, unknown>
      if (!(field in self)) return null
      return {
        source: 'self',
        ref: `self.${field}`,
        data: self[field],
        why: r.why,
      }
    }
  }
}

function findSceneObject(
  objects: readonly SceneObject[],
  id: string | number | undefined
): SceneObject | null {
  if (id === undefined) return null
  // Try strict equality first (string vs number distinction matters).
  const strict = objects.find((o) => o.id === id)
  if (strict) return strict
  // Fallback: stringified match (the LLM often returns numbers as strings).
  return objects.find((o) => String(o.id) === String(id)) ?? null
}

// --- Action menu filtering ---

export function filterActionMenu(
  full: readonly ActionDoc[],
  inPlay: readonly string[]
): readonly ActionDoc[] {
  if (inPlay.length === 0) return full
  // `always` actions are the PFC's baseline agency and are kept no matter
  // what; the thalamus's list only *adds* context-specific actions on top.
  // This guarantees the menu can never collapse to a single option.
  const highlighted = new Set(inPlay)
  const filtered = full.filter((a) => a.always || highlighted.has(a.name))
  return filtered.length === 0 ? full : filtered
}

function refLabel(r: FocusRef): string {
  if (r.id !== undefined) return `${r.source}/${r.id}`
  if (r.kind && r.tick !== undefined) return `${r.source}/${r.kind}@t${r.tick}`
  if (r.tick !== undefined) return `${r.source}@t${r.tick}`
  return r.source
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
