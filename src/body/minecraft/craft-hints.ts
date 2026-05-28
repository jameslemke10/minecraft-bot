import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { BodyHintsContext, CraftOption } from '../types.js'

const MAX_OPTIONS = 20

/** Priority outputs when many recipes match — keeps prompts small. */
const PRIORITY_ITEMS = [
  'oak_planks',
  'stick',
  'crafting_table',
  'wooden_pickaxe',
  'wooden_axe',
  'wooden_shovel',
  'wooden_hoe',
  'wooden_sword',
  'torch',
  'chest',
  'furnace',
  'ladder',
]

/**
 * List items craftable RIGHT NOW from actual mineflayer recipes + inventory.
 */
export function describeCraftablePart(bot: Bot): {
  craftable: CraftOption[]
  crafting_table_nearby: boolean
} {
  const table = bot.findBlock({
    matching: (b: Block) => b.name === 'crafting_table',
    maxDistance: 6,
  })
  const hasTable = !!table

  const options: CraftOption[] = []
  const seen = new Set<string>()

  const tryItem = (name: string): void => {
    if (seen.has(name) || options.length >= MAX_OPTIONS) return
    const itemData = bot.registry.itemsByName[name]
    if (!itemData) return

    let recipes = bot.recipesFor(itemData.id, null, 1, null)
    let needsTable = false
    if (recipes.length === 0 && hasTable) {
      recipes = bot.recipesFor(itemData.id, null, 1, table)
      needsTable = recipes.length > 0
    }
    const recipe = recipes[0]
    if (!recipe || !canCraftRecipe(bot, recipe)) return

    seen.add(name)
    options.push({
      item: name,
      ingredients: formatIngredients(bot, recipe),
      needs_table: needsTable,
    })
  }

  for (const name of PRIORITY_ITEMS) tryItem(name)

  for (const inv of bot.inventory.items()) {
    if (options.length >= MAX_OPTIONS) break
    // 2x2 transforms of held materials
    if (inv.name.endsWith('_log')) tryItem(inv.name.replace(/_log$/, '_planks'))
    tryItem(inv.name)
  }

  return {
    craftable: options,
    crafting_table_nearby: hasTable,
  }
}

function canCraftRecipe(
  bot: Bot,
  recipe: { delta?: Array<{ id: number; count: number }> }
): boolean {
  if (!recipe.delta) return false
  for (const d of recipe.delta) {
    if (d.count >= 0) continue
    const need = -d.count
    const have = countItem(bot, d.id)
    if (have < need) return false
  }
  return true
}

function countItem(bot: Bot, itemId: number): number {
  let n = 0
  for (const i of bot.inventory.items()) {
    if (i.type === itemId) n += i.count
  }
  return n
}

function formatIngredients(
  bot: Bot,
  recipe: { delta?: Array<{ id: number; count: number }> }
): string {
  if (!recipe.delta) return '(unknown)'
  const parts: string[] = []
  for (const d of recipe.delta) {
    if (d.count >= 0) continue
    const name = bot.registry.items[d.id]?.name ?? `item#${d.id}`
    parts.push(`${-d.count}×${name}`)
  }
  return parts.join(' + ') || '(none)'
}
