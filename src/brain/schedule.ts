import type { Body } from '../body/types.js'
import type { Action } from './types.js'
import { logger } from '../logger.js'
import { Workspace, selfFromPercept } from './workspace.js'
import { attention } from './attention.js'
import { executive } from './executive.js'

export interface BrainLoopOptions {
  /** Stop after N ticks. Omit for unbounded. */
  maxTicks?: number
  /** Min ms between ticks (prevents pure spin if a tick has no action). */
  minTickIntervalMs?: number
}

/**
 * The conscious loop: sense → Attention (Thalamus) → Executive (PFC) → act.
 * Serial in v1. Each module reads/writes only its declared slice of the
 * workspace. The whole loop is ~30 lines of orchestration.
 */
export async function runBrain(
  body: Body<Action>,
  workspace: Workspace,
  opts: BrainLoopOptions = {}
): Promise<void> {
  const { maxTicks, minTickIntervalMs = 250 } = opts
  let tick = 0

  while (maxTicks === undefined || tick < maxTicks) {
    try {
      // 1. Sense
      const percept = await body.sense()

      // 2. Attention (Thalamus): full percept + WM slice → salient items
      const attSlice = workspace.sliceForAttention()
      const attOut = await attention({
        percept,
        intention: attSlice.intention,
        recent_thoughts: attSlice.recent_thoughts,
      })
      workspace.patchFromAttention({
        self: selfFromPercept(percept),
        salient: attOut.salient,
        tick,
      })
      logger.info(
        { tick, salient: attOut.salient.map((s) => s.what) },
        'Atticus notices'
      )

      // 3. Executive (PFC): WM slice → thought + intention + action
      const execSlice = workspace.sliceForExecutive()
      const execOut = await executive({
        self: execSlice.self,
        salient: execSlice.salient,
        intention: execSlice.intention,
        recent_thoughts: execSlice.recent_thoughts,
        tick,
      })
      workspace.patchFromExecutive({
        thought: execOut.thought,
        intention: execOut.intention,
      })
      logger.info(
        { tick, thought: execOut.thought.text, intention: execOut.intention },
        'Atticus thinks'
      )

      // 4. Act
      if (execOut.action) {
        await body.execute(execOut.action)
      }
    } catch (err) {
      logger.error({ err: String(err), tick }, 'brain tick failed — skipping')
    }

    await sleep(minTickIntervalMs)
    tick++
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
