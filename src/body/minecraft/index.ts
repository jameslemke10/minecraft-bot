import mineflayer, { type Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import prismarineViewerPkg from 'prismarine-viewer'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ActionDoc, Body } from '../types.js'
import type { Action } from '../../brain/types.js'

const MINECRAFT_ACTIONS: readonly ActionDoc[] = [
  {
    name: 'move',
    signature: 'move(x, z)',
    description:
      'Pathfind on the surface to absolute world coordinates. Y is automatic. Use to travel.',
  },
  {
    name: 'chat',
    signature: 'chat(msg)',
    description: 'Say something out loud. Other players hear it.',
  },
  {
    name: 'wait',
    signature: 'wait(ms)',
    description: 'Pause for ms milliseconds (max 60000). Useful to slow down or observe.',
  },
  {
    name: 'mine',
    signature: 'mine(x, y, z)',
    description:
      'Walk to within reach of the block at (x,y,z) and break it. You need the right tool for hard blocks (wood for wood, pickaxe for stone and ores). Without a tool you can still punch wood and dirt slowly.',
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
      'Craft an item by name. Some recipes (planks, sticks) work from your 2x2 inventory grid; tools and most things need you to be next to a crafting_table. Use exact item names (e.g. "oak_planks", "stick", "crafting_table", "wooden_pickaxe").',
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
import { WorldState } from './world-state.js'
import { attachPerception } from './perception.js'
import { execute, type ExecuteDeps } from './execute.js'
import { buildRawPercept } from './sensors/index.js'

const { pathfinder, Movements } = pathfinderPkg
const { mineflayer: mineflayerViewer } = prismarineViewerPkg

/**
 * Create the Minecraft Body — implements the env-agnostic Body interface.
 * Connects to the server, wires perception, exposes sense() and execute().
 */
export async function createMinecraftBody(): Promise<Body<Action>> {
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
  // Don't start sensing until the surrounding chunks exist, otherwise the
  // first percepts read empty/air for the whole world.
  try {
    await bot.waitForChunksToLoad()
  } catch (err) {
    logger.warn({ err: String(err) }, 'waitForChunksToLoad failed — continuing')
  }

  const movements = new Movements(bot)
  movements.canDig = false
  const deps: ExecuteDeps = { bot, movements }

  if (config.viewer.enabled) {
    startViewer(bot, config.viewer.thirdPersonPort, false)
    startViewer(bot, config.viewer.firstPersonPort, true)
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
    disconnect: () => bot.quit('disconnecting'),
    describeActions: () => MINECRAFT_ACTIONS,
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
