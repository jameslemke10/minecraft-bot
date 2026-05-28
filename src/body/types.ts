/**
 * Environment-agnostic body contracts. Brain modules import from here.
 *
 * `Body<TAction>` is generic so different environments can define their own
 * Action types without this file knowing about them. Minecraft uses the
 * Action type from brain/types.ts.
 */

import type { EventLogEntry } from '../brain/types.js'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface InventoryItem {
  name: string
  count: number
  slot: number
}

export interface NearbyEntity {
  id: number
  name: string
  type: string
  position: Vec3
  distance: number
}

export interface NearbyBlock {
  type: string
  position: Vec3
  distance: number
}

export type Motion = 'still' | 'walking' | 'falling' | 'rising'

export interface SelfPercept {
  position: Vec3
  yaw: number
  pitch: number
  health: number
  food: number
  on_ground: boolean
  in_water: boolean
  /** Derived from delta to last tick's position + on_ground. */
  motion: Motion
  inventory: InventoryItem[]
  held_item: string | null
}

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export type Weather = 'clear' | 'rain' | 'thunder'

export interface TerrainPercept {
  biome: string
  time_of_day: TimeOfDay
  time_ticks: number
  weather: Weather
  block_at_feet: string
  block_looking_at: string | null
}

// --- Scene: structured 3D-aware perception ---

export type CompassDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

/** A clustered, named thing in the world the LLM can reason about. */
export interface SceneObject {
  /**
   * Stable identifier within this percept. Strings for blocks ("oak_tree:1"),
   * numbers for entities (mineflayer entity id), strings for aggregates
   * ("incoming_arrows", "passive_mob_group:cow").
   */
  id: string | number
  kind: string                                  // "oak_tree", "skeleton", "water_pool", ...
  anchor: Vec3                                  // canonical coord (trunk base, entity pos, vein center)
  bbox?: [Vec3, Vec3]                           // [min, max] for multi-block objects
  distance: number                              // from bot, in blocks
  dir: CompassDir                               // 8-way compass relative to bot
  meta?: Record<string, unknown>
}

export interface ScenePercept {
  /** Multi-line ASCII grid + legend. 16×16, viewer-relative. */
  heightmap: string
  objects: SceneObject[]
}

export interface RawPercept {
  self: SelfPercept
  terrain: TerrainPercept
  scene: ScenePercept
  nearby_entities: NearbyEntity[]
  /** Events that JUST happened this tick. Schedule appends each into WM event_log. */
  new_events: EventLogEntry[]
  tick: number
  timestamp: number
}

/**
 * Documentation for one action verb. Bodies emit these so brain modules
 * remain env-agnostic — the executive prompt is built from this list, not
 * from hardcoded text.
 */
export interface ActionDoc {
  name: string
  signature: string          // e.g. "mine(x, y, z)"
  description: string        // one or two sentences
}

/**
 * The contract every environment must implement.
 *
 * sense() returns a snapshot of the world from the agent's perspective.
 * execute() dispatches a typed action into the environment.
 * disconnect() releases env resources cleanly.
 * describeActions() declares the verbs this body supports.
 */
export interface Body<TAction = unknown> {
  envName: string
  sense(): Promise<RawPercept>
  execute(action: TAction): Promise<void>
  disconnect(): void
  describeActions(): readonly ActionDoc[]
}
