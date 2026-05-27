import type { Bot } from 'mineflayer'
import type { NearbyEntity } from '../../types.js'

const RADIUS = 16
const MAX_ENTITIES = 16

/**
 * Things-not-me within sensing range: players, mobs, items, projectiles.
 * Sorted by distance, capped at MAX_ENTITIES so we don't dump 100 chickens
 * into the brain's context window.
 */
export function senseEntities(bot: Bot): NearbyEntity[] {
  if (!bot.entity?.position) return []
  const me = bot.entity.position

  return Object.values(bot.entities)
    .filter((e) => e.id !== bot.entity.id && e.position)
    .map((e) => ({
      id: e.id,
      name: e.name ?? e.username ?? e.type,
      type: e.type,
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
      distance: e.position.distanceTo(me),
    }))
    .filter((e) => e.distance <= RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_ENTITIES)
}
