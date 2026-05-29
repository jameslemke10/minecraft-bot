import type { Bot } from 'mineflayer'
import { Vec3 as MFVec3 } from 'vec3'
import type {
  BlockAt,
  EntityPercept,
  MineableBlock,
  Percept,
  SelfPercept,
  Surroundings,
  TimeOfDay,
  Weather,
  WorldFacts,
} from './percept.js'
import type { WorldState } from './world-state.js'
import { describeMineable } from '../mine-hints.js'

const CUBE_RADIUS = 8 // ±8 → bounded local awareness ("bounded x-ray")
const NEAR_RADIUS = 2 // touching shell + one layer out (see blocking dirt/stone)
const NEAR_CAP = 30
const NOTABLE_CAP = 40
const ENTITY_RADIUS = 16
const MAX_ENTITIES = 16

/** Common filler blocks summarized as counts rather than listed individually. */
const BULK = new Set([
  'stone', 'dirt', 'grass_block', 'gravel', 'sand', 'red_sand', 'coarse_dirt',
  'podzol', 'clay', 'andesite', 'diorite', 'granite', 'tuff', 'calcite',
  'deepslate', 'cobbled_deepslate', 'cobblestone', 'mossy_cobblestone',
  'sandstone', 'dripstone_block', 'netherrack', 'bedrock',
])

const AIR = new Set(['air', 'cave_air', 'void_air'])

export function buildPercept(bot: Bot, world: WorldState, tick: number): Percept {
  const pos = bot.entity?.position
  const motion = pos
    ? world.updateMotion({ x: pos.x, y: pos.y, z: pos.z }, bot.entity.onGround)
    : 'still'

  return {
    tick,
    timestamp: Date.now(),
    self: senseSelf(bot, motion),
    world: senseWorld(bot),
    surroundings: senseSurroundings(bot),
    mineable: senseMineable(bot),
    entities: senseEntities(bot),
    new_events: world.drainEvents(tick),
  }
}

function senseSelf(bot: Bot, motion: SelfPercept['motion']): SelfPercept {
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
    inventory: bot.inventory.items().map((it) => ({ name: it.name, count: it.count, slot: it.slot })),
    held_item: bot.heldItem?.name ?? null,
  }
}

function senseWorld(bot: Bot): WorldFacts {
  return {
    biome: getBiome(bot),
    time_of_day: getTimeOfDay(bot.time?.timeOfDay ?? 0),
    time_ticks: bot.time?.timeOfDay ?? 0,
    weather: getWeather(bot),
  }
}

function senseSurroundings(bot: Bot): Surroundings {
  const me = bot.entity.position
  const bx = Math.floor(me.x)
  const by = Math.floor(me.y)
  const bz = Math.floor(me.z)

  const blockAt = (dx: number, dy: number, dz: number): BlockAt | null => {
    const b = bot.blockAt(new MFVec3(bx + dx, by + dy, bz + dz))
    if (!b || AIR.has(b.name)) return null
    return {
      name: b.name,
      pos: { x: bx + dx, y: by + dy, z: bz + dz },
      dist: Math.round(Math.hypot(dx, dy, dz) * 10) / 10,
    }
  }

  // What holds you up — emphasized. null = falling / over a drop.
  const standing_on = blockAt(0, -1, 0)

  const near: BlockAt[] = []
  const notable: BlockAt[] = []
  const R = CUBE_RADIUS
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx === 0 && dy === -1 && dz === 0) continue // already standing_on
        const b = bot.blockAt(new MFVec3(bx + dx, by + dy, bz + dz))
        if (!b || AIR.has(b.name)) continue // open space = absence, never listed
        // Passable decoration (grass, flowers, ferns) is walk-through clutter
        // everywhere; fluids are passable but are hazards, so keep them.
        const isFluid = b.name === 'water' || b.name === 'lava'
        if (b.boundingBox === 'empty' && !isFluid) continue
        const within = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
        const entry: BlockAt = {
          name: b.name,
          pos: { x: bx + dx, y: by + dy, z: bz + dz },
          dist: Math.round(Math.hypot(dx, dy, dz) * 10) / 10,
        }
        if (within <= NEAR_RADIUS) {
          near.push(entry) // immediate cage — every solid block, incl. stone
          continue
        }
        // Farther out: only non-bulk blocks (resource/hazard radar).
        if (BULK.has(b.name)) continue
        notable.push(entry)
      }
    }
  }
  near.sort((a, b) => a.dist - b.dist)
  notable.sort((a, b) => a.dist - b.dist)

  return {
    radius: R,
    near_radius: NEAR_RADIUS,
    standing_on,
    near: near.slice(0, NEAR_CAP),
    notable: notable.slice(0, NOTABLE_CAP),
  }
}

function senseMineable(bot: Bot): MineableBlock[] {
  const me = bot.entity?.position
  if (!me) return []
  return describeMineable(bot).map((m) => ({
    id: m.id,
    name: m.block,
    pos: { x: m.x, y: m.y, z: m.z },
    dist: Math.round(Math.hypot(m.x + 0.5 - me.x, m.y + 0.5 - me.y, m.z + 0.5 - me.z) * 10) / 10,
    relation: m.relation,
  }))
}

function senseEntities(bot: Bot): EntityPercept[] {
  const me = bot.entity?.position
  if (!me) return []
  return Object.values(bot.entities)
    .filter((e) => e.id !== bot.entity.id && e.position)
    .map((e) => ({
      id: e.id,
      kind: e.name ?? e.type ?? 'entity',
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
      distance: Math.round(e.position.distanceTo(me) * 10) / 10,
    }))
    .filter((e) => e.distance <= ENTITY_RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_ENTITIES)
}

// --- terrain helpers (honest global facts) ---

function getBiome(bot: Bot): string {
  try {
    const block = bot.blockAt(bot.entity.position)
    if (!block) return 'unknown'
    const biome = (block as { biome?: number | { id?: number; name?: string } }).biome
    if (typeof biome === 'number') return bot.registry.biomes[biome]?.name ?? 'unknown'
    if (biome && typeof biome === 'object') {
      if (typeof biome.id === 'number' && bot.registry.biomes[biome.id]?.name) {
        return bot.registry.biomes[biome.id]!.name
      }
      if (biome.name) return biome.name
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function getTimeOfDay(ticks: number): TimeOfDay {
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

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
