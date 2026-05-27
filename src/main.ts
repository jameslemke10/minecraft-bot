import { createBody } from './body/bot.js'
import { runLoop } from './loop.js'
import { logger } from './logger.js'
import { perceive } from './brain/perceiver.js'
import type { Action, Brain, WorldSnapshot } from './brain/types.js'

/**
 * Wander-brain (from M1): no LLM, just nudges Atticus around a square so the
 * world keeps changing while the Perceiver narrates.
 */
const wanderBrain: Brain = async (snap) => {
  const corners: Array<{ x: number; z: number }> = [
    { x: snap.position.x + 5, z: snap.position.z },
    { x: snap.position.x + 5, z: snap.position.z + 5 },
    { x: snap.position.x, z: snap.position.z + 5 },
    { x: snap.position.x, z: snap.position.z },
  ]
  const target = corners[snap.tick % corners.length]!
  const actions: Action[] = [{ kind: 'move', args: { x: target.x, z: target.z } }]
  return actions
}

/**
 * Perceiver-brain: calls Gemini to describe Atticus's experience, logs it,
 * returns no actions. Errors are logged but don't break the loop.
 */
const perceiverBrain: Brain = async (snap) => {
  try {
    const observation = await perceive(snap)
    logger.info({ obs: observation, pos: snap.position }, 'Atticus perceives')
  } catch (err) {
    logger.warn({ err: String(err) }, 'perceiver failed')
  }
  return []
}

/**
 * M2 brain: wander and perceive in parallel. Two independent functions
 * composed with Promise.all — this *is* parallel brain functions, no
 * framework required.
 */
const brain: Brain = async (snap: WorldSnapshot) => {
  const [, actions] = await Promise.all([perceiverBrain(snap), wanderBrain(snap)])
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

  await runLoop(body, brain)
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'fatal error')
  process.exit(1)
})
