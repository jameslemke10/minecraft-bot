import type { Bot } from 'mineflayer'
import type { NearbyBlock, TerrainPercept, TimeOfDay, Weather } from '../../types.js'

const NEARBY_RADIUS = 12
const MAX_NEARBY_BLOCKS = 10

/**
 * Block types Atticus should "notice" when scanning his surroundings.
 * Anything not in this set is ignored as background terrain.
 * Refine as needed: when he misses something obvious, add it here.
 */
const NOTABLE_BLOCK_NAMES = new Set<string>([
  // Wood
  'oak_log', 'birch_log', 'spruce_log', 'jungle_log',
  'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log',
  // Fluids
  'water', 'lava',
  // Ores (overworld + deepslate variants)
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'copper_ore', 'emerald_ore', 'lapis_ore', 'redstone_ore',
  'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore',
  'deepslate_diamond_ore', 'deepslate_copper_ore',
  'deepslate_emerald_ore', 'deepslate_lapis_ore', 'deepslate_redstone_ore',
  // Civilization
  'chest', 'crafting_table', 'furnace', 'smoker', 'blast_furnace',
  'bed', 'white_bed', 'red_bed', 'blue_bed',
  // Hazards
  'fire', 'cactus', 'magma_block',
])

export function senseTerrain(bot: Bot): TerrainPercept {
  return {
    biome: getBiome(bot),
    time_of_day: getTimeOfDay(bot.time?.timeOfDay ?? 0),
    time_ticks: bot.time?.timeOfDay ?? 0,
    weather: getWeather(bot),
    block_at_feet: getBlockAtFeet(bot),
    block_looking_at: getBlockLookingAt(bot),
  }
}

export function senseNearbyBlocks(bot: Bot): NearbyBlock[] {
  if (!bot.entity?.position) return []
  const me = bot.entity.position

  const positions = bot.findBlocks({
    matching: (block) => NOTABLE_BLOCK_NAMES.has(block.name),
    maxDistance: NEARBY_RADIUS,
    count: MAX_NEARBY_BLOCKS * 3, // over-collect, sort, slice
  })

  return positions
    .map((pos) => {
      const block = bot.blockAt(pos)
      if (!block) return null
      return {
        type: block.name,
        position: { x: pos.x, y: pos.y, z: pos.z },
        distance: pos.distanceTo(me),
      }
    })
    .filter((b): b is NearbyBlock => b !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_NEARBY_BLOCKS)
}

function getBiome(bot: Bot): string {
  try {
    const block = bot.blockAt(bot.entity.position)
    const biome = block?.biome as { name?: string } | undefined
    return biome?.name ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function getTimeOfDay(ticks: number): TimeOfDay {
  // Minecraft day cycle: 0=sunrise, 6000=noon, 12000=sunset, 18000=midnight
  if (ticks < 6000) return 'morning'
  if (ticks < 12000) return 'day'
  if (ticks < 18000) return 'evening'
  return 'night'
}

function getWeather(bot: Bot): Weather {
  if (bot.thunderState && bot.thunderState > 0) return 'thunder'
  if (bot.isRaining) return 'rain'
  return 'clear'
}

function getBlockAtFeet(bot: Bot): string {
  try {
    const pos = bot.entity.position.offset(0, -1, 0)
    return bot.blockAt(pos)?.name ?? 'air'
  } catch {
    return 'unknown'
  }
}

function getBlockLookingAt(bot: Bot): string | null {
  try {
    const block = bot.blockAtCursor(8)
    return block?.name ?? null
  } catch {
    return null
  }
}
