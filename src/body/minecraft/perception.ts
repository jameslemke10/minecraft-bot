import type { Bot } from 'mineflayer'
import type { WorldState } from './world-state.js'

const NEARBY_RADIUS = 16

/**
 * Wire mineflayer events into the WorldState event buffer as structured
 * EventLogEntry drafts (without tick — stamped at drain). The schedule
 * appends each into the WM's event_log.
 */
export function attachPerception(bot: Bot, world: WorldState): void {
  let lastHealth = 20
  let lastFood = 20

  bot.on('spawn', () => {
    const p = bot.entity?.position
    const where = p ? `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})` : 'unknown'
    world.pushEvent({ kind: 'percept_change', delta: `spawned at ${where}` })
    if (Number.isFinite(bot.health)) lastHealth = bot.health
    if (Number.isFinite(bot.food)) lastFood = bot.food
  })

  bot.on('health', () => {
    const h = bot.health
    if (Number.isFinite(h) && h !== lastHealth) {
      const delta = h - lastHealth
      if (delta < 0) {
        world.pushEvent({ kind: 'damage', amount: round1(-delta), source: 'unknown' })
      } else {
        world.pushEvent({
          kind: 'percept_change',
          delta: `health regen ${fmt(lastHealth)} → ${fmt(h)}`,
        })
      }
      lastHealth = h
    }
    const f = bot.food
    if (Number.isFinite(f) && f !== lastFood) {
      if (f < lastFood) {
        world.pushEvent({
          kind: 'percept_change',
          delta: `hunger ${fmt(lastFood)} → ${fmt(f)}`,
        })
      }
      lastFood = f
    }
  })

  bot.on('playerJoined', (p) => {
    world.pushEvent({ kind: 'percept_change', delta: `player joined: ${p.username}` })
  })
  bot.on('playerLeft', (p) => {
    world.pushEvent({ kind: 'percept_change', delta: `player left: ${p.username}` })
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    world.pushEvent({ kind: 'chat', sender: username, text: message })
  })

  bot.on('death', () => {
    world.pushEvent({ kind: 'percept_change', delta: 'died' })
  })
  bot.on('kicked', (reason) => {
    world.pushEvent({ kind: 'percept_change', delta: `kicked: ${reason}` })
  })

  bot.on('entitySpawn', (entity) => {
    if (!entity.position || !bot.entity?.position) return
    if (entity.position.distanceTo(bot.entity.position) <= NEARBY_RADIUS) {
      const name = entity.name ?? entity.type
      world.pushEvent({
        kind: 'percept_change',
        delta: `${name} appeared at (${fmt(entity.position.x)}, ${fmt(entity.position.y)}, ${fmt(entity.position.z)})`,
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
