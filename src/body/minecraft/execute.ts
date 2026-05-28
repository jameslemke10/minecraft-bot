import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import type { Movements, goals as GoalsNS } from 'mineflayer-pathfinder'
import { Vec3 as MFVec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import { ActionSchema, type Action } from '../../brain/types.js'
import { logger } from '../../logger.js'

const { goals } = pathfinderPkg

const MOVE_TIMEOUT_MS = 30_000
const INTERACT_REACH = 3

export interface ExecuteDeps {
  bot: Bot
  movements: Movements
}

/**
 * Validate an action and dispatch it to mineflayer. Resolves when the action
 * is complete (or has timed out / been rejected). The brain awaits this so
 * the loop is action-driven in v1.
 */
export async function execute(deps: ExecuteDeps, raw: unknown): Promise<void> {
  const parsed = ActionSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ raw, issues: parsed.error.issues }, 'rejected malformed action')
    return
  }
  const action = parsed.data
  logger.info({ action }, 'executing action')

  try {
    switch (action.kind) {
      case 'move':
        await doMove(deps, action)
        return
      case 'chat':
        deps.bot.chat(action.args.msg)
        return
      case 'wait':
        await sleep(action.args.ms)
        return
      case 'mine':
        await doMine(deps, action)
        return
      case 'place':
        await doPlace(deps, action)
        return
      case 'craft':
        await doCraft(deps, action)
        return
      case 'equip':
        await doEquip(deps, action)
        return
      case 'attack':
        await doAttack(deps, action)
        return
      case 'eat':
        await doEat(deps, action)
        return
      case 'sleep':
        await doSleep(deps)
        return
    }
  } catch (err) {
    logger.warn({ action, err: String(err) }, 'action failed')
  }
}

async function doMove(
  { bot, movements }: ExecuteDeps,
  action: Extract<Action, { kind: 'move' }>
): Promise<void> {
  const { x, z } = action.args
  const me = bot.entity?.position
  if (me && Math.abs(me.x - x) < 1 && Math.abs(me.z - z) < 1) {
    logger.warn({ x, z, currentX: me.x, currentZ: me.z }, 'move: already at target, skipping')
    return
  }
  bot.pathfinder.setMovements(movements)
  await runGoal(bot, new goals.GoalNearXZ(x, z, 1), MOVE_TIMEOUT_MS, { x, z })
}

async function doMine(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'mine' }>
): Promise<void> {
  const { bot } = deps
  const { x, y, z } = action.args
  const pos = new MFVec3(x, y, z)
  const block = bot.blockAt(pos)
  if (!block || block.name === 'air') {
    logger.warn({ x, y, z }, 'mine: no block at coords')
    return
  }
  await goNear(deps, x, y, z)
  if (!bot.canDigBlock(block)) {
    logger.warn({ x, y, z, name: block.name }, 'mine: cannot dig (out of reach or unbreakable)')
    return
  }
  await bot.dig(block)
}

async function doPlace(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'place' }>
): Promise<void> {
  const { bot } = deps
  const { x, y, z, block: blockName } = action.args

  const invItem = bot.inventory.items().find((i) => i.name === blockName)
  if (!invItem) {
    logger.warn({ blockName }, 'place: not in inventory')
    return
  }

  const target = new MFVec3(x, y, z)
  const existing = bot.blockAt(target)
  if (existing && existing.name !== 'air') {
    logger.warn({ x, y, z, name: existing.name }, 'place: target already occupied')
    return
  }

  await goNear(deps, x, y, z, INTERACT_REACH + 1)
  await bot.equip(invItem, 'hand')

  const ref = findPlacementReference(bot, target)
  if (!ref) {
    logger.warn({ x, y, z }, 'place: no adjacent solid block to place against')
    return
  }
  const face = target.minus(ref.position)
  await bot.placeBlock(ref, face)
}

async function doCraft(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'craft' }>
): Promise<void> {
  const { bot } = deps
  const { item, count = 1 } = action.args
  const itemData = bot.registry.itemsByName[item]
  if (!itemData) {
    logger.warn({ item }, 'craft: unknown item name')
    return
  }

  let recipes = bot.recipesFor(itemData.id, null, 1, null)
  let table: Block | null = null
  if (recipes.length === 0) {
    table = bot.findBlock({
      matching: (b) => b.name === 'crafting_table',
      maxDistance: 6,
    })
    if (!table) {
      logger.warn({ item }, 'craft: no inventory recipe and no crafting table nearby')
      return
    }
    await goNear(deps, table.position.x, table.position.y, table.position.z)
    recipes = bot.recipesFor(itemData.id, null, 1, table)
  }
  const recipe = recipes[0]
  if (!recipe) {
    logger.warn({ item }, 'craft: no recipe available with current ingredients')
    return
  }
  await bot.craft(recipe, count, table ?? undefined)
}

async function doEquip(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'equip' }>
): Promise<void> {
  const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
  if (!invItem) {
    logger.warn({ item: action.args.item }, 'equip: not in inventory')
    return
  }
  await bot.equip(invItem, 'hand')
}

async function doAttack(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'attack' }>
): Promise<void> {
  const { bot } = deps
  const entity = bot.entities[action.args.entityId]
  if (!entity?.position) {
    logger.warn({ entityId: action.args.entityId }, 'attack: entity not in range')
    return
  }
  const { x, y, z } = entity.position
  await goNear(deps, x, y, z, INTERACT_REACH)
  bot.attack(entity)
}

async function doEat(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'eat' }>
): Promise<void> {
  if (action.args.item) {
    const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
    if (!invItem) {
      logger.warn({ item: action.args.item }, 'eat: not in inventory')
      return
    }
    await bot.equip(invItem, 'hand')
  }
  await bot.consume()
}

async function doSleep(deps: ExecuteDeps): Promise<void> {
  const { bot } = deps
  const bed = bot.findBlock({
    matching: (b) => b.name.endsWith('_bed'),
    maxDistance: 16,
  })
  if (!bed) {
    logger.warn({}, 'sleep: no bed nearby')
    return
  }
  await goNear(deps, bed.position.x, bed.position.y, bed.position.z)
  await bot.sleep(bed)
}

function findPlacementReference(bot: Bot, target: MFVec3): Block | null {
  const offsets: Array<[number, number, number]> = [
    [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  ]
  for (const [dx, dy, dz] of offsets) {
    const refPos = target.offset(dx, dy, dz)
    const ref = bot.blockAt(refPos)
    if (ref && ref.name !== 'air' && ref.boundingBox === 'block') return ref
  }
  return null
}

async function goNear(
  { bot, movements }: ExecuteDeps,
  x: number,
  y: number,
  z: number,
  range = INTERACT_REACH
): Promise<void> {
  bot.pathfinder.setMovements(movements)
  await runGoal(bot, new goals.GoalNear(x, y, z, range), MOVE_TIMEOUT_MS, { x, y, z, range })
}

async function runGoal(
  bot: Bot,
  goal: GoalsNS.Goal,
  timeoutMs: number,
  ctx: Record<string, unknown>
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(ctx, 'pathfind timed out')
      bot.pathfinder.stop()
      resolve()
    }, timeoutMs)
  })
  try {
    await Promise.race([
      bot.pathfinder.goto(goal).catch((err: unknown) => {
        logger.warn({ ...ctx, err: String(err) }, 'pathfinder.goto failed')
      }),
      timeoutPromise,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
