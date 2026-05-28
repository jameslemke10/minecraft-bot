import type { ActionDoc, Body, RawPercept, SceneObject } from '../body/types.js'
import type {
  Action,
  EventLogEntry,
  FocusRef,
} from './types.js'
import { logger } from '../logger.js'
import type { Metrics } from '../llm/metrics.js'
import { Workspace, selfFromPercept } from './workspace.js'
import { attention } from './attention.js'
import { executive } from './executive.js'
import { computeDrivesBase, finalizeDrives } from './drives.js'
import {
  filterActionMenu,
  hydrateFocus,
  type BrainLoopOptions,
} from './schedule.js'

const METRICS_EVERY_TICKS = 10

/**
 * Brutus's conscious loop — Thalamus ∥ drives (base), then hydrate, finalize
 * drives, PFC, act. sense → [Thalamus | drives_base] → hydrate → drives → PFC → act
 */
export async function runBrainWithDrives(
  body: Body<Action>,
  workspace: Workspace,
  opts: BrainLoopOptions
): Promise<void> {
  const { maxTicks, postProcessorDelayMs = 0, agentId, displayName, identity, metrics, runLog } =
    opts
  const actionMenu = body.describeActions()
  let tick = workspace.lastTick > 0 ? workspace.lastTick + 1 : 0
  const startTick = tick

  while (maxTicks === undefined || tick - startTick < maxTicks) {
    try {
      const percept = await body.sense()
      workspace.updateSelfAndTick(selfFromPercept(percept), tick)

      for (const ev of percept.new_events) {
        workspace.appendEvent({ ...ev, tick })
      }

      const slice = workspace.sliceForThalamus()
      const bodyHints = body.describeBodyHints
        ? await body.describeBodyHints({ intention: slice.intention })
        : undefined
      const prevDriveState = workspace.getDriveState()

      const [att, drivesBase] = await Promise.all([
        attention({
          percept,
          intention: slice.intention,
          recent_events: slice.recent_events,
          action_menu: actionMenu,
          identity,
          displayName,
          metrics,
          body_hints: bodyHints,
          runLog,
        }),
        Promise.resolve(
          computeDrivesBase({
            self: selfFromPercept(percept),
            intention: slice.intention,
            recent_events: slice.recent_events,
            prev: prevDriveState,
            tick,
          })
        ),
      ])

      logger.info(
        {
          agent: agentId,
          tick,
          focus: att.focus_refs.map((r) => `${refLabel(r)} — ${r.why}`),
          actions_in_play: att.actions_in_play,
          brief: att.brief,
        },
        `${displayName} notices`
      )
      if (postProcessorDelayMs > 0) await sleep(postProcessorDelayMs)

      const focus = hydrateFocus(percept, workspace.eventLog, att.focus_refs, bodyHints)
      const menu = filterActionMenu(actionMenu, att.actions_in_play)

      const drives = finalizeDrives(drivesBase, focus, {
        self: selfFromPercept(percept),
        intention: slice.intention,
        tick,
      })
      workspace.setDriveState(drives.state)
      runLog?.recordDrives(drives.signals)
      logger.info(
        { agent: agentId, tick, signals: drives.signals, felt: drives.felt },
        `${displayName} feels`
      )

      const exec = await executive({
        focus,
        self: selfFromPercept(percept),
        intention: slice.intention,
        recent_events: slice.recent_events,
        action_menu: menu,
        ...(att.brief ? { brief: att.brief } : {}),
        tick,
        identity,
        displayName,
        metrics,
        drives,
        body_hints: bodyHints,
        runLog,
      })
      workspace.appendEvent(exec.thought)
      workspace.setIntention(exec.intention)
      logger.info(
        {
          agent: agentId,
          tick,
          thought: exec.thought.text,
          intention: exec.intention,
          action: exec.action,
        },
        `${displayName} thinks`
      )
      if (postProcessorDelayMs > 0) await sleep(postProcessorDelayMs)

      let actionOutcome: import('../body/action-result.js').ActionResult | undefined
      if (exec.action) {
        workspace.appendEvent({ kind: 'action', tick, action: exec.action })
        actionOutcome = await body.execute(exec.action)
        workspace.appendEvent({
          kind: 'action_outcome',
          tick,
          action: exec.action,
          ok: actionOutcome.ok,
          message: actionOutcome.message,
        })
      }

      runLog?.recordTick({
        tick,
        thalamus: att,
        drives: { signals: drives.signals, felt: drives.felt },
        thought: exec.thought.text,
        intention: exec.intention,
        action: exec.action,
        ...(actionOutcome ? { action_outcome: actionOutcome } : {}),
        ...(bodyHints ? { body_hints: bodyHints } : {}),
      })
    } catch (err) {
      logger.error({ agent: agentId, err: String(err), tick }, 'brain tick failed — skipping')
    }

    if ((tick - startTick + 1) % METRICS_EVERY_TICKS === 0) {
      logger.info({ agent: agentId, ...metrics.summary() }, 'run metrics (running total)')
    }

    tick++
  }
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
