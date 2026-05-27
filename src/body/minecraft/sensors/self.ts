import type { Bot } from 'mineflayer'
import type { SelfPercept } from '../../types.js'

/**
 * Proprioception: where Atticus is, how he's oriented, his vitals.
 * Read directly from mineflayer — no buffering, no derived state.
 */
export function senseSelf(bot: Bot): SelfPercept {
  const e = bot.entity
  return {
    position: { x: e.position.x, y: e.position.y, z: e.position.z },
    yaw: e.yaw,
    pitch: e.pitch,
    health: Number.isFinite(bot.health) ? bot.health : 20,
    food: Number.isFinite(bot.food) ? bot.food : 20,
    on_ground: e.onGround,
    in_water: bot.blockAt(e.position)?.name === 'water',
    inventory: bot.inventory.items().map((it) => ({
      name: it.name,
      count: it.count,
      slot: it.slot,
    })),
    held_item: bot.heldItem?.name ?? null,
  }
}
