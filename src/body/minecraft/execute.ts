import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import type { Movements, goals as GoalsNS } from 'mineflayer-pathfinder'
import { Vec3 as MFVec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import { ActionSchema, type Action } from '../../brain/types.js'
import { actionFail, actionOk, type ActionResult } from '../action-result.js'
import { logger } from '../../logger.js'

const { goals } = pathfinderPkg

const MOVE_TIMEOUT_MS = 30_000
const INTERACT_REACH = 3

export interface ExecuteDeps {
  bot: Bot
  movements: Movements
}

/**
 * Validate an action and dispatch it to mineflayer. Returns an outcome the
 * brain can log — failures are visible to the PFC on the next tick.
 */
export async function execute(deps: ExecuteDeps, raw: unknown): Promise<ActionResult> {
  const parsed = ActionSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ raw, issues: parsed.error.issues }, 'rejected malformed action')
    return actionFail('malformed action')
  }
  const action = parsed.data
  logger.info({ action }, 'executing action')

  try {
    switch (action.kind) {
      case 'move':
        return await doMove(deps, action)
      case 'chat':
        deps.bot.chat(action.args.msg)
        return actionOk('sent chat')
      case 'wait':
        await sleep(action.args.ms)
        return actionOk(`waited ${action.args.ms}ms`)
      case 'mine':
        return await doMine(deps, action)
      case 'place':
        return await doPlace(deps, action)
      case 'craft':
        return await doCraft(deps, action)
      case 'equip':
        return await doEquip(deps, action)
      case 'attack':
        return await doAttack(deps, action)
      case 'eat':
        return await doEat(deps, action)
      case 'sleep':
        return await doSleep(deps)
    }
  } catch (err) {
    const msg = String(err)
    logger.warn({ action, err: msg }, 'action failed')
    return actionFail(msg)
  }
}

async function doMove(
  { bot, movements }: ExecuteDeps,
  action: Extract<Action, { kind: 'move' }>
): Promise<ActionResult> {
  const { x, z } = action.args
  const me = bot.entity?.position
  if (me && Math.abs(me.x - x) < 1 && Math.abs(me.z - z) < 1) {
    logger.warn({ x, z, currentX: me.x, currentZ: me.z }, 'move: already at target, skipping')
    return actionFail('already at target')
  }
  bot.pathfinder.setMovements(movements)
  await runGoal(bot, new goals.GoalNearXZ(x, z, 1), MOVE_TIMEOUT_MS, { x, z })
  return actionOk('pathfind complete')
}

async function doMine(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'mine' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { x, y, z } = action.args
  const pos = new MFVec3(x, y, z)
  const block = bot.blockAt(pos)
  if (!block || block.name === 'air') {
    logger.warn({ x, y, z }, 'mine: no block at coords')
    return actionFail('no block at coords')
  }
  await goNear(deps, x, y, z)
  if (!bot.canDigBlock(block)) {
    logger.warn({ x, y, z, name: block.name }, 'mine: cannot dig (out of reach or unbreakable)')
    return actionFail('cannot dig (out of reach or unbreakable)')
  }
  await bot.dig(block)
  return actionOk(`mined ${block.name}`)
}

async function doPlace(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'place' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { x, y, z, block: blockName } = action.args

  const invItem = bot.inventory.items().find((i) => i.name === blockName)
  if (!invItem) {
    logger.warn({ blockName }, 'place: not in inventory')
    return actionFail(`no ${blockName} in inventory`)
  }

  const target = new MFVec3(x, y, z)
  const existing = bot.blockAt(target)
  if (existing && existing.name !== 'air') {
    logger.warn({ x, y, z, name: existing.name }, 'place: target already occupied')
    return actionFail(`target occupied by ${existing.name}`)
  }

  await goNear(deps, x, y, z, INTERACT_REACH + 1)
  await bot.equip(invItem, 'hand')

  const ref = findPlacementReference(bot, target)
  if (!ref) {
    logger.warn({ x, y, z }, 'place: no adjacent solid block to place against')
    return actionFail('no adjacent solid block to place against')
  }
  const face = target.minus(ref.position)
  await bot.placeBlock(ref, face)
  return actionOk(`placed ${blockName}`)
}

async function doCraft(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'craft' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { item, count = 1 } = action.args
  const itemData = bot.registry.itemsByName[item]
  if (!itemData) {
    logger.warn({ item }, 'craft: unknown item name')
    return actionFail(`unknown item: ${item}`)
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
      return actionFail('no recipe in inventory grid and no crafting table nearby')
    }
    await goNear(deps, table.position.x, table.position.y, table.position.z)
    recipes = bot.recipesFor(itemData.id, null, 1, table)
  }
  const recipe = recipes[0]
  if (!recipe) {
    logger.warn({ item }, 'craft: no recipe available with current ingredients')
    return actionFail('no recipe with current ingredients')
  }
  await bot.craft(recipe, count, table ?? undefined)
  return actionOk(`crafted ${count}×${item}`)
}

async function doEquip(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'equip' }>
): Promise<ActionResult> {
  const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
  if (!invItem) {
    logger.warn({ item: action.args.item }, 'equip: not in inventory')
    return actionFail(`no ${action.args.item} in inventory`)
  }
  await bot.equip(invItem, 'hand')
  return actionOk(`equipped ${action.args.item}`)
}

async function doAttack(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'attack' }>
): Promise<ActionResult> {
  const { bot } = deps
  const entity = bot.entities[action.args.entityId]
  if (!entity?.position) {
    logger.warn({ entityId: action.args.entityId }, 'attack: entity not in range')
    return actionFail('entity not found')
  }
  const { x, y, z } = entity.position
  await goNear(deps, x, y, z, INTERACT_REACH)
  bot.attack(entity)
  return actionOk('attacked entity')
}

async function doEat(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'eat' }>
): Promise<ActionResult> {
  if (action.args.item) {
    const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
    if (!invItem) {
      logger.warn({ item: action.args.item }, 'eat: not in inventory')
      return actionFail(`no ${action.args.item} in inventory`)
    }
    await bot.equip(invItem, 'hand')
  }
  await bot.consume()
  return actionOk('ate food')
}

async function doSleep(deps: ExecuteDeps): Promise<ActionResult> {
  const { bot } = deps
  const bed = bot.findBlock({
    matching: (b) => b.name.endsWith('_bed'),
    maxDistance: 16,
  })
  if (!bed) {
    logger.warn({}, 'sleep: no bed nearby')
    return actionFail('no bed nearby')
  }
  await goNear(deps, bed.position.x, bed.position.y, bed.position.z)
  await bot.sleep(bed)
  return actionOk('sleeping')
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
