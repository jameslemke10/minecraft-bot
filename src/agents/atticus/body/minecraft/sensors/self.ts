import type { Bot } from 'mineflayer'
import type { Motion, SelfPercept } from '../../../../../body/types.js'

/**
 * Proprioception: where Atticus is, how he's oriented, his vitals.
 * Read directly from mineflayer. `motion` is passed in by the body
 * (computed by WorldState.updateMotion from the prior tick's position).
 */
export function senseSelf(bot: Bot, motion: Motion): SelfPercept {
  const e = bot.entity
  return {
    position: { x: e.position.x, y: e.position.y, z: e.position.z },
    yaw: e.yaw,
    pitch: e.pitch,
    health: round1(Number.isFinite(bot.health) ? bot.health : 20),
    food: round1(Number.isFinite(bot.food) ? bot.food : 20),
    on_ground: e.onGround,
    in_water: bot.blockAt(e.position)?.name === 'water',
    motion,
    inventory: bot.inventory.items().map((it) => ({
      name: it.name,
      count: it.count,
      slot: it.slot,
    })),
    held_item: bot.heldItem?.name ?? null,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
