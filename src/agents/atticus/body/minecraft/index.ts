import mineflayer, { type Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { config } from '../../../../config.js'
import { logger } from '../../../../logger.js'
import type { ActionDoc, Body } from '../../../../body/types.js'
import type { Action } from '../../../../brain/types.js'
import { disconnectBot, startViewerSafe } from '../../../../body/viewer.js'
import type { MinecraftBodyOptions } from '../../../types.js'
import { WorldState } from './world-state.js'
import { attachPerception } from './perception.js'
import { execute, type ExecuteDeps } from './execute.js'
import { describeBodyHints } from '../../../../body/minecraft/body-hints.js'
import { buildRawPercept } from './sensors/index.js'

const MINECRAFT_ACTIONS: readonly ActionDoc[] = [
  {
    name: 'move',
    signature: 'move(x, z)',
    description:
      'Pathfind on the surface to absolute world coordinates. Y is automatic. Use to travel.',
    always: true,
  },
  {
    name: 'chat',
    signature: 'chat(msg)',
    description: 'Say something out loud. Other players hear it.',
    always: true,
  },
  {
    name: 'wait',
    signature: 'wait(ms)',
    description: 'Pause for ms milliseconds (max 60000). Useful to slow down or observe.',
    always: true,
  },
  {
    name: 'mine',
    signature: 'mine(x, y, z)',
    description:
      'Break a block at (x,y,z). Use ONLY coordinates from "Mineable now" in your prompt — those are blocks in reach right now.',
  },
  {
    name: 'place',
    signature: 'place(x, y, z, block)',
    description:
      'Walk to within reach of (x,y,z), equip the named block from your inventory, and place it there. There must be a solid block adjacent to (x,y,z) to place against. Use exact item names (e.g. "oak_planks", "dirt", "cobblestone").',
  },
  {
    name: 'craft',
    signature: 'craft(item, count?)',
    description:
      'Craft an item by name. See "Craftable now" in your prompt for exact items and ingredients you can make right now.',
  },
  {
    name: 'equip',
    signature: 'equip(item)',
    description: 'Hold a named item from your inventory in your main hand.',
  },
  {
    name: 'attack',
    signature: 'attack(entityId)',
    description:
      'Walk to within reach of the entity with that id (from focus or entities) and attack once. Used for combat or hunting animals.',
  },
  {
    name: 'eat',
    signature: 'eat(item?)',
    description:
      'Consume a food item from your inventory. If item is omitted, consumes whatever you are currently holding (must be food).',
  },
  {
    name: 'sleep',
    signature: 'sleep()',
    description:
      'Walk to the nearest bed and sleep. Only works at night and only if the area is safe.',
  },
]

const { pathfinder, Movements } = pathfinderPkg

/**
 * Create the Minecraft Body — implements the env-agnostic Body interface.
 * Connects to the server, wires perception, exposes sense() and execute().
 */
export async function createMinecraftBody(
  opts: MinecraftBodyOptions
): Promise<Body<Action>> {
  logger.info(
    {
      host: config.mc.host,
      port: config.mc.port,
      version: config.mc.version,
      username: opts.username,
    },
    'connecting to minecraft server'
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
    {
      position: bot.entity.position,
      health: bot.health,
      username: bot.username,
    },
    'bot spawned'
  )

  let tick = 0

  return {
    envName: 'minecraft',
    sense: async () => buildRawPercept(bot, world, tick++),
    execute: (action) => execute(deps, action),
    describeBodyHints: async (ctx) => describeBodyHints(bot, ctx),
    disconnect: () => disconnectBot(bot),
    describeActions: () => MINECRAFT_ACTIONS,
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
