import { createBody } from './body/bot.js'
import { runLoop } from './loop.js'
import { logger } from './logger.js'
import type { Action, Brain } from './brain/types.js'

/**
 * M1 brain: no LLM yet. Wanders a small square so we can confirm the body
 * works end-to-end. No chat — server anti-spam kicks the bot if we talk
 * every tick.
 */
const m1Brain: Brain = async (snap) => {
  const corners: Array<{ x: number; z: number }> = [
    { x: snap.position.x + 10, z: snap.position.z },
    { x: snap.position.x + 10, z: snap.position.z + 10 },
    { x: snap.position.x, z: snap.position.z + 10 },
    { x: snap.position.x, z: snap.position.z },
  ]
  const target = corners[snap.tick % corners.length]!

  const actions: Action[] = [
    { kind: 'move', args: { x: target.x, z: target.z } },
  ]
  return actions
}

async function main(): Promise<void> {
  const body = await createBody()

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down')
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await runLoop(body, m1Brain)
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'fatal error')
  process.exit(1)
})
