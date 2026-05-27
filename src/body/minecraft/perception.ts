import type { Bot } from 'mineflayer'
import type { WorldState } from './world-state.js'

const NEARBY_RADIUS = 16

/**
 * Wire mineflayer events into the event ring buffer. Sensors will read the
 * buffer to populate `recent_events` in each RawPercept.
 *
 * Everything *current* (position, vitals, inventory) is read directly from
 * the bot by sensors at sense-time — we only buffer things that are
 * *historical* and would otherwise be lost.
 */
export function attachPerception(bot: Bot, world: WorldState): void {
  let lastHealth = 20

  bot.on('spawn', () => {
    const p = bot.entity?.position
    if (p) {
      world.pushEvent(`spawned at (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`)
    } else {
      world.pushEvent('spawned')
    }
    if (Number.isFinite(bot.health)) lastHealth = bot.health
  })

  bot.on('health', () => {
    const next = bot.health
    if (Number.isFinite(next) && next !== lastHealth) {
      world.pushEvent(`health: ${fmt(lastHealth)} -> ${fmt(next)}`)
      lastHealth = next
    }
  })

  bot.on('playerJoined', (p) => world.pushEvent(`player joined: ${p.username}`))
  bot.on('playerLeft', (p) => world.pushEvent(`player left: ${p.username}`))

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    world.pushEvent(`<${username}> ${message}`)
  })

  bot.on('death', () => world.pushEvent('died'))
  bot.on('kicked', (reason) => world.pushEvent(`kicked: ${reason}`))

  bot.on('entitySpawn', (entity) => {
    if (!entity.position || !bot.entity?.position) return
    if (entity.position.distanceTo(bot.entity.position) <= NEARBY_RADIUS) {
      world.pushEvent(`entity nearby: ${entity.name ?? entity.type}`)
    }
  })
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '?'
}
