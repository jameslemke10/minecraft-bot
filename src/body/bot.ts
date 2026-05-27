import mineflayer, { type Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import prismarineViewerPkg from 'prismarine-viewer'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { WorldState } from './world-state.js'
import { attachPerception } from './perception.js'
import { execute, type ExecuteDeps } from './execute.js'
import type { Action } from '../brain/types.js'

const { pathfinder, Movements } = pathfinderPkg
const { mineflayer: mineflayerViewer } = prismarineViewerPkg

export interface Body {
  bot: Bot
  world: WorldState
  snapshot: () => ReturnType<WorldState['snapshot']>
  execute: (action: Action) => Promise<void>
  disconnect: () => void
}

/**
 * Create the bot, connect to the server, wire perception, and resolve once
 * the bot has fully spawned (so the caller can immediately use the body).
 */
export async function createBody(): Promise<Body> {
  logger.info(
    { host: config.mc.host, port: config.mc.port, version: config.mc.version },
    'connecting to minecraft server'
  )

  const bot = mineflayer.createBot({
    host: config.mc.host,
    port: config.mc.port,
    version: config.mc.version,
    username: config.mc.username,
    auth: 'offline',
  })

  bot.loadPlugin(pathfinder)

  const world = new WorldState()
  attachPerception(bot, world)

  await waitForSpawn(bot)

  const movements = new Movements(bot)
  movements.canDig = false // safer default for M1
  const deps: ExecuteDeps = { bot, movements }

  if (config.viewer.enabled) {
    startViewer(bot, config.viewer.thirdPersonPort, false)
    startViewer(bot, config.viewer.firstPersonPort, true)
  }

  logger.info(
    {
      position: world.position,
      health: world.health,
      username: bot.username,
    },
    'bot spawned'
  )

  return {
    bot,
    world,
    snapshot: () => world.snapshot(),
    execute: (action) => execute(deps, action),
    disconnect: () => bot.quit('disconnecting'),
  }
}

function startViewer(bot: Bot, port: number, firstPerson: boolean): void {
  try {
    mineflayerViewer(bot, { port, firstPerson })
    logger.info(
      { url: `http://localhost:${port}`, view: firstPerson ? 'first-person' : 'third-person' },
      'viewer started'
    )
  } catch (err) {
    logger.warn({ err: String(err), port }, 'viewer failed to start')
  }
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
