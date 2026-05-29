/**
 * The shared, task-agnostic percept for the experiment body. Both arms
 * (Dimitri's curator and the compaction baseline) consume this identical
 * structure — perception is a controlled constant, not part of the variable.
 *
 * Self-contained: this module does NOT import brain types. The body emits
 * only world-level facts and events; the brain adds thoughts/actions/outcomes.
 */
import type { Vec3 } from '../../types.js'

export type Motion = 'still' | 'walking' | 'falling' | 'rising'
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export type Weather = 'clear' | 'rain' | 'thunder'

export interface InventoryItem {
  name: string
  count: number
  slot: number
}

/** Proprioception — fully surfaced; a body honestly knows its own state. */
export interface SelfPercept {
  position: Vec3
  yaw: number
  pitch: number
  health: number
  food: number
  on_ground: boolean
  in_water: boolean
  motion: Motion
  inventory: InventoryItem[]
  held_item: string | null
}

/** Global facts a body can honestly sense without omniscience. */
export interface WorldFacts {
  biome: string
  time_of_day: TimeOfDay
  time_ticks: number
  weather: Weather
}

/** A real (non-air) block, given by its absolute world coords. */
export interface BlockAt {
  name: string
  pos: Vec3 // absolute world coords
  dist: number // blocks from the bot
}

/**
 * Bounded local awareness — only real blocks, never air (open space = absence).
 * - `standing_on`: the block directly below the feet — emphasized; what holds
 *   you up. null means nothing is there (you are falling / over a drop).
 * - `near`: every non-air block within `near_radius` (your immediate cage:
 *   walls, floor, ceiling, plus anything embedded close by).
 * - `notable`: non-bulk blocks (ores/logs/water/lava/containers) farther out to
 *   `radius` — the resource/hazard radar of the bounded x-ray.
 */
export interface Surroundings {
  radius: number
  near_radius: number
  standing_on: BlockAt | null
  near: BlockAt[]
  notable: BlockAt[]
}

export interface EntityPercept {
  id: number
  kind: string
  position: Vec3
  distance: number
}

/** World-level events the body observed since the last sense(). */
export type WorldEvent =
  | { kind: 'damage'; tick: number; amount: number; source: string }
  | { kind: 'chat'; tick: number; sender: string; text: string }
  | { kind: 'change'; tick: number; text: string }

/** Draft event before the loop stamps it with a tick. */
export type DraftWorldEvent =
  | { kind: 'damage'; amount: number; source: string }
  | { kind: 'chat'; sender: string; text: string }
  | { kind: 'change'; text: string }

export interface Percept {
  tick: number
  timestamp: number
  self: SelfPercept
  world: WorldFacts
  surroundings: Surroundings
  entities: EntityPercept[]
  new_events: WorldEvent[]
}
