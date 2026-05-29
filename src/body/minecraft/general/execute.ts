import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import type { Movements, goals as GoalsNS } from 'mineflayer-pathfinder'
import { Vec3 as MFVec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import { ActionSchema, type Action } from './actions.js'
import { actionFail, actionOk, type ActionResult } from '../../action-result.js'
import { logger } from '../../../logger.js'

const { goals } = pathfinderPkg

const MOVE_TIMEOUT_MS = 30_000
const INTERACT_REACH = 3
const SMELT_WAIT_MS = 12_000

export interface ExecuteDeps {
  bot: Bot
  movements: Movements
}

/** Validate + dispatch an action to mineflayer. Failures are returned, not thrown. */
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
      case 'wait':
        await sleep(action.args.ms)
        return actionOk(`waited ${action.args.ms}ms`)
      case 'chat':
        deps.bot.chat(action.args.msg)
        return actionOk('sent chat')
      case 'mine':
        return await doMine(deps, action)
      case 'place':
        return await doPlace(deps, action)
      case 'craft':
        return await doCraft(deps, action)
      case 'smelt':
        return await doSmelt(deps, action)
      case 'equip':
        return await doEquip(deps, action)
      case 'eat':
        return await doEat(deps, action)
      case 'attack':
        return await doAttack(deps, action)
      case 'activate':
        return await doActivate(deps, action)
      case 'drop':
        return await doDrop(deps, action)
      case 'sleep':
        return await doSleep(deps)
      default:
        return assertNever(action)
    }
  } catch (err) {
    const msg = String(err)
    logger.warn({ action, err: msg }, 'action failed')
    return actionFail(msg)
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled action: ${JSON.stringify(x)}`)
}

async function doMove(
  { bot, movements }: ExecuteDeps,
  action: Extract<Action, { kind: 'move' }>
): Promise<ActionResult> {
  const { x, z } = action.args
  const me = bot.entity?.position
  if (me && Math.abs(me.x - x) < 1 && Math.abs(me.z - z) < 1) return actionFail('already at target')
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
  const block = bot.blockAt(new MFVec3(x, y, z))
  if (!block || block.name === 'air') return actionFail('no block at coords')
  await goNear(deps, x, y, z)
  if (!bot.canDigBlock(block)) return actionFail('cannot dig (out of reach or wrong tool)')
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
  if (!invItem) return actionFail(`no ${blockName} in inventory`)

  const target = new MFVec3(x, y, z)
  const existing = bot.blockAt(target)
  if (existing && existing.name !== 'air') return actionFail(`target occupied by ${existing.name}`)

  await goNear(deps, x, y, z, INTERACT_REACH + 1)
  await bot.equip(invItem, 'hand')
  const ref = findPlacementReference(bot, target)
  if (!ref) return actionFail('no adjacent solid block to place against')
  await bot.placeBlock(ref, target.minus(ref.position))
  return actionOk(`placed ${blockName}`)
}

async function doCraft(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'craft' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { item, count = 1 } = action.args
  const itemData = bot.registry.itemsByName[item]
  if (!itemData) return actionFail(`unknown item: ${item}`)

  let recipes = bot.recipesFor(itemData.id, null, 1, null)
  let table: Block | null = null
  if (recipes.length === 0) {
    table = bot.findBlock({ matching: (b) => b.name === 'crafting_table', maxDistance: 6 })
    if (!table) return actionFail('no recipe in inventory grid and no crafting table nearby')
    await goNear(deps, table.position.x, table.position.y, table.position.z)
    recipes = bot.recipesFor(itemData.id, null, 1, table)
  }
  const recipe = recipes[0]
  if (!recipe) return actionFail('no recipe with current ingredients')
  await bot.craft(recipe, count, table ?? undefined)
  return actionOk(`crafted ${count}×${item}`)
}

async function doSmelt(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'smelt' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { input, fuel, count = 1 } = action.args
  const furnaceBlock = bot.findBlock({
    matching: (b) => b.name === 'furnace' || b.name === 'lit_furnace' || b.name === 'blast_furnace',
    maxDistance: 6,
  })
  if (!furnaceBlock) return actionFail('no furnace within reach — craft and place one first')

  const inputData = bot.registry.itemsByName[input]
  const fuelData = bot.registry.itemsByName[fuel]
  if (!inputData) return actionFail(`unknown input item: ${input}`)
  if (!fuelData) return actionFail(`unknown fuel item: ${fuel}`)
  if (countItem(bot, inputData.id) < 1) return actionFail(`no ${input} in inventory`)
  if (countItem(bot, fuelData.id) < 1) return actionFail(`no ${fuel} in inventory`)

  await goNear(deps, furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z)

  const furnace = await (bot as unknown as {
    openFurnace: (b: Block) => Promise<FurnaceWindow>
  }).openFurnace(furnaceBlock)

  try {
    const want = Math.min(count, countItem(bot, inputData.id))
    const fuelToAdd = Math.min(Math.max(1, Math.ceil(want / 8)), countItem(bot, fuelData.id))
    await furnace.putFuel(fuelData.id, null, fuelToAdd)
    await furnace.putInput(inputData.id, null, want)

    // Bounded wait for output, then collect whatever smelted.
    const deadline = Date.now() + SMELT_WAIT_MS
    let collected = 0
    while (Date.now() < deadline) {
      await sleep(1000)
      if (furnace.outputItem()) {
        const out = await furnace.takeOutput()
        if (out) collected += out.count
        if (collected >= want) break
      }
    }
    return collected > 0
      ? actionOk(`smelted ${collected}×${input}`)
      : actionFail('furnace did not finish smelting in time — try again')
  } finally {
    try {
      furnace.close()
    } catch {
      /* best effort */
    }
  }
}

interface FurnaceWindow {
  putFuel(itemType: number, metadata: number | null, count: number): Promise<void>
  putInput(itemType: number, metadata: number | null, count: number): Promise<void>
  takeOutput(): Promise<{ count: number } | null>
  outputItem(): unknown
  close(): void
}

async function doEquip(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'equip' }>
): Promise<ActionResult> {
  const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
  if (!invItem) return actionFail(`no ${action.args.item} in inventory`)
  await bot.equip(invItem, action.args.dest ?? 'hand')
  return actionOk(`equipped ${action.args.item}${action.args.dest ? ` to ${action.args.dest}` : ''}`)
}

async function doEat(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'eat' }>
): Promise<ActionResult> {
  if (action.args.item) {
    const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
    if (!invItem) return actionFail(`no ${action.args.item} in inventory`)
    await bot.equip(invItem, 'hand')
  }
  await bot.consume()
  return actionOk('ate food')
}

async function doAttack(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'attack' }>
): Promise<ActionResult> {
  const { bot } = deps
  const entity = bot.entities[action.args.entityId]
  if (!entity?.position) return actionFail('entity not found')
  const { x, y, z } = entity.position
  await goNear(deps, x, y, z, INTERACT_REACH)
  bot.attack(entity)
  return actionOk('attacked entity')
}

async function doActivate(
  deps: ExecuteDeps,
  action: Extract<Action, { kind: 'activate' }>
): Promise<ActionResult> {
  const { bot } = deps
  const { x, y, z } = action.args
  const block = bot.blockAt(new MFVec3(x, y, z))
  if (!block || block.name === 'air') return actionFail('no block at coords')
  await goNear(deps, x, y, z)
  await bot.activateBlock(block)
  return actionOk(`activated ${block.name}`)
}

async function doDrop(
  { bot }: ExecuteDeps,
  action: Extract<Action, { kind: 'drop' }>
): Promise<ActionResult> {
  const invItem = bot.inventory.items().find((i) => i.name === action.args.item)
  if (!invItem) return actionFail(`no ${action.args.item} in inventory`)
  await bot.toss(invItem.type, null, action.args.count ?? invItem.count)
  return actionOk(`dropped ${action.args.item}`)
}

async function doSleep(deps: ExecuteDeps): Promise<ActionResult> {
  const { bot } = deps
  const bed = bot.findBlock({ matching: (b) => b.name.endsWith('_bed'), maxDistance: 16 })
  if (!bed) return actionFail('no bed nearby')
  await goNear(deps, bed.position.x, bed.position.y, bed.position.z)
  await bot.sleep(bed)
  return actionOk('sleeping')
}

// --- helpers ---

function countItem(bot: Bot, itemId: number): number {
  let n = 0
  for (const i of bot.inventory.items()) if (i.type === itemId) n += i.count
  return n
}

function findPlacementReference(bot: Bot, target: MFVec3): Block | null {
  const offsets: Array<[number, number, number]> = [
    [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  ]
  for (const [dx, dy, dz] of offsets) {
    const ref = bot.blockAt(target.offset(dx, dy, dz))
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
