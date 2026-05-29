import type { Bot } from 'mineflayer'
import type { WorldState } from './world-state.js'

const NEARBY_RADIUS = 16

/**
 * Wire mineflayer events into the WorldState buffer as draft world events.
 * The body drains these into each percept's `new_events`.
 */
export function attachPerception(bot: Bot, world: WorldState): void {
  let lastHealth = 20
  let lastFood = 20

  bot.on('spawn', () => {
    const p = bot.entity?.position
    const where = p ? `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})` : 'unknown'
    world.pushEvent({ kind: 'change', text: `spawned at ${where}` })
    if (Number.isFinite(bot.health)) lastHealth = bot.health
    if (Number.isFinite(bot.food)) lastFood = bot.food
  })

  bot.on('health', () => {
    const h = bot.health
    if (Number.isFinite(h) && h !== lastHealth) {
      if (h < lastHealth) {
        world.pushEvent({ kind: 'damage', amount: round1(lastHealth - h), source: 'unknown' })
      } else {
        world.pushEvent({ kind: 'change', text: `health regen ${fmt(lastHealth)} → ${fmt(h)}` })
      }
      lastHealth = h
    }
    const f = bot.food
    if (Number.isFinite(f) && f !== lastFood) {
      if (f < lastFood) world.pushEvent({ kind: 'change', text: `hunger ${fmt(lastFood)} → ${fmt(f)}` })
      lastFood = f
    }
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    world.pushEvent({ kind: 'chat', sender: username, text: message })
  })

  bot.on('death', () => {
    world.pushEvent({ kind: 'change', text: 'died' })
  })
  bot.on('kicked', (reason) => {
    world.pushEvent({ kind: 'change', text: `kicked: ${String(reason)}` })
  })

  bot.on('entitySpawn', (entity) => {
    if (!entity.position || !bot.entity?.position) return
    if (entity.position.distanceTo(bot.entity.position) <= NEARBY_RADIUS) {
      const name = entity.name ?? entity.type
      world.pushEvent({
        kind: 'change',
        text: `${name} appeared at (${fmt(entity.position.x)}, ${fmt(entity.position.y)}, ${fmt(entity.position.z)})`,
      })
    }
  })
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '?'
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
