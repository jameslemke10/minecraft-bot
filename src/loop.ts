import type { Body } from './body/bot.js'
import type { Brain } from './brain/types.js'
import { logger } from './logger.js'

export interface LoopOptions {
  /** Stop after N ticks. Omit for unbounded. */
  maxTicks?: number
  /** Min ms between ticks (debounce when actions return instantly). */
  minTickIntervalMs?: number
}

/**
 * Action-driven brain loop: each tick, snapshot → brain → execute every
 * returned action sequentially → repeat. This is the entire control loop.
 */
export async function runLoop(
  body: Body,
  brain: Brain,
  opts: LoopOptions = {}
): Promise<void> {
  const { maxTicks, minTickIntervalMs = 250 } = opts
  let tick = 0

  while (maxTicks === undefined || tick < maxTicks) {
    body.world.tick = tick
    const snap = body.snapshot()
    logger.debug({ tick, snap }, 'tick start')

    let actions
    try {
      actions = await brain(snap)
    } catch (err) {
      logger.error({ err: String(err), tick }, 'brain threw — skipping tick')
      await sleep(minTickIntervalMs)
      tick++
      continue
    }

    for (const action of actions) {
      await body.execute(action)
    }

    await sleep(minTickIntervalMs)
    tick++
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
