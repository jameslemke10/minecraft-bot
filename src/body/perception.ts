import type { Bot } from 'mineflayer'
import type { WorldState } from './world-state.js'

const NEARBY_RADIUS = 16

/**
 * Wire mineflayer events into world-state mutations. After this, world-state
 * stays fresh in the background without the brain doing anything.
 */
export function attachPerception(bot: Bot, world: WorldState): void {
  bot.on('spawn', () => {
    const p = bot.entity?.position
    if (p) {
      world.pushEvent(`spawned at (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`)
    } else {
      world.pushEvent('spawned')
    }
    refreshFromBot(bot, world)
  })

  bot.on('move', () => {
    if (!bot.entity?.position) return
    world.position = {
      x: bot.entity.position.x,
      y: bot.entity.position.y,
      z: bot.entity.position.z,
    }
    world.yaw = bot.entity.yaw
    world.pitch = bot.entity.pitch
  })

  bot.on('health', () => {
    const next = bot.health
    if (Number.isFinite(next) && next !== world.health) {
      world.pushEvent(`health: ${fmt(world.health)} -> ${fmt(next)}`)
      world.health = next
    }
    if (Number.isFinite(bot.food)) {
      world.food = bot.food
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
    if (!entity.position) return
    if (entity.position.distanceTo(bot.entity.position) <= NEARBY_RADIUS) {
      world.pushEvent(`entity nearby: ${entity.name ?? entity.type}`)
    }
  })

  // Periodic refresh of derived state (inventory, nearby entities)
  setInterval(() => refreshFromBot(bot, world), 1000)
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '?'
}

function refreshFromBot(bot: Bot, world: WorldState): void {
  if (!bot.entity?.position) return

  world.position = {
    x: bot.entity.position.x,
    y: bot.entity.position.y,
    z: bot.entity.position.z,
  }
  world.yaw = bot.entity.yaw
  world.pitch = bot.entity.pitch
  if (Number.isFinite(bot.health)) world.health = bot.health
  if (Number.isFinite(bot.food)) world.food = bot.food

  world.inventory = bot.inventory.items().map((it) => ({
    name: it.name,
    count: it.count,
    slot: it.slot,
  }))

  const me = bot.entity.position
  world.nearbyEntities = Object.values(bot.entities)
    .filter((e) => e.id !== bot.entity.id && e.position)
    .map((e) => ({
      id: e.id,
      name: e.name ?? e.username ?? e.type,
      type: e.type,
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
      distance: e.position.distanceTo(me),
    }))
    .filter((e) => e.distance <= NEARBY_RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 16)
}
