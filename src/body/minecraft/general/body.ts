import mineflayer, { type Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { config } from '../../../config.js'
import { logger } from '../../../logger.js'
import type { Body } from '../../types.js'
import { disconnectBot, startViewerSafe } from '../../viewer.js'
import { WorldState } from './world-state.js'
import { attachPerception } from './perception-events.js'
import { buildPercept } from './sensors.js'
import { execute, type ExecuteDeps } from './execute.js'
import { ACTION_DOCS, type Action } from './actions.js'
import type { Percept } from './percept.js'

const { pathfinder, Movements } = pathfinderPkg

export interface GeneralBodyOptions {
  username: string
  viewer: { enabled: boolean; thirdPersonPort: number; firstPersonPort: number }
}

/**
 * The shared, task-agnostic Minecraft body used by BOTH experiment arms
 * (Dimitri and the compaction baseline). Returns the structured `Percept`;
 * brain code renders it via renderPercept so both arms see identical text.
 */
export async function createGeneralBody(
  opts: GeneralBodyOptions
): Promise<Body<Action, Percept>> {
  logger.info(
    { host: config.mc.host, port: config.mc.port, version: config.mc.version, username: opts.username },
    'connecting general body to minecraft server'
  )

  const bot = mineflayer.createBot({
    host: config.mc.host,
    port: config.mc.port,
    version: config.mc.version,
    username: opts.username,
    auth: 'offline',
  })
  bot.loadPlugin(pathfinder)

  const world = new WorldState()
  attachPerception(bot, world)

  await waitForSpawn(bot)
  try {
    await bot.waitForChunksToLoad()
  } catch (err) {
    logger.warn({ err: String(err) }, 'waitForChunksToLoad failed — continuing')
  }
  await settleOnGround(bot)

  const movements = new Movements(bot)
  movements.canDig = false
  const deps: ExecuteDeps = { bot, movements }

  if (opts.viewer.enabled) {
    await startViewerSafe(bot, opts.viewer.thirdPersonPort, false)
    await startViewerSafe(bot, opts.viewer.firstPersonPort, true)
  }

  logger.info(
    { position: bot.entity.position, health: bot.health, username: bot.username },
    'general body spawned'
  )

  let tick = 0
  return {
    envName: 'minecraft',
    sense: async () => buildPercept(bot, world, tick++),
    execute: (action) => execute(deps, action),
    disconnect: () => disconnectBot(bot),
    describeActions: () => ACTION_DOCS,
  }
}

async function settleOnGround(bot: Bot): Promise<void> {
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    if (bot.entity?.onGround) return
    try {
      await bot.waitForTicks(5)
    } catch {
      return
    }
  }
  logger.warn({ y: bot.entity?.position?.y }, 'bot did not settle on ground before timeout')
}

function waitForSpawn(bot: Bot): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSpawn = (): void => {
      bot.removeListener('error', onError)
      bot.removeListener('kicked', onKicked)
      resolve()
    }
    const onError = (err: Error): void => reject(err)
    const onKicked = (reason: string): void => reject(new Error(`kicked: ${reason}`))
    bot.once('spawn', onSpawn)
    bot.once('error', onError)
    bot.once('kicked', onKicked)
  })
}
