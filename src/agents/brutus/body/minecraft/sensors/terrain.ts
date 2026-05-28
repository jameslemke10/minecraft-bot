import type { Bot } from 'mineflayer'
import type { TerrainPercept, TimeOfDay, Weather } from '../../../../../body/types.js'

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

function getBiome(bot: Bot): string {
  try {
    const block = bot.blockAt(bot.entity.position)
    if (!block) return 'unknown'
    // mineflayer 4.x: block.biome is the biome ID (number). Look up name via registry.
    const biomeId = (block as { biome?: number | { id?: number; name?: string } }).biome
    if (typeof biomeId === 'number') {
      const biomeDef = bot.registry.biomes[biomeId]
      return biomeDef?.name ?? 'unknown'
    }
    // Fallback for older shapes where biome is an object with .name.
    if (biomeId && typeof biomeId === 'object') {
      if (typeof biomeId.id === 'number') {
        const biomeDef = bot.registry.biomes[biomeId.id]
        if (biomeDef?.name) return biomeDef.name
      }
      if (typeof biomeId.name === 'string') return biomeId.name
    }
    return 'unknown'
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
