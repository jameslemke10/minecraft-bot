/**
 * Environment-agnostic body contracts. Brain modules import from here.
 *
 * `Body<TAction>` is generic so different environments can define their own
 * Action types without this file knowing about them. Minecraft uses the
 * Action type from brain/types.ts.
 */

import type { ActionResult } from './action-result.js'
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
  /**
   * Always offered to the PFC regardless of the thalamus's action filter.
   * These are the "you can always do this" verbs (move/chat/wait) — the
   * filter highlights *additional* context-specific actions, it never
   * removes the baseline, so the PFC can never be trapped into one option.
   */
  always?: boolean
}

/** One craft option resolved from live recipes + inventory (not LLM knowledge). */
export interface CraftOption {
  item: string
  ingredients: string
  needs_table: boolean
}

/** Context passed when computing live body affordances. */
export interface BodyHintsContext {
  intention?: string
}

/** One block breakable from the bot's current position. */
export interface MineOption {
  id: string
  x: number
  y: number
  z: number
  block: string
  relation: string
}

/** Dynamic hints the body computes each tick — recipes, reachability, etc. */
export interface BodyHints {
  craftable: readonly CraftOption[]
  crafting_table_nearby: boolean
  mineable: readonly MineOption[]
}

/**
 * The contract every environment must implement.
 *
 * sense() returns a snapshot of the world from the agent's perspective.
 * execute() dispatches a typed action into the environment.
 * disconnect() releases env resources cleanly.
 * describeActions() declares the verbs this body supports.
 * describeBodyHints() optional — live recipe/craft info for the brain.
 */
export interface Body<TAction = unknown, TPercept = RawPercept> {
  envName: string
  sense(): Promise<TPercept>
  execute(action: TAction): Promise<ActionResult>
  disconnect(): void
  describeActions(): readonly ActionDoc[]
  describeBodyHints?(ctx?: BodyHintsContext): Promise<BodyHints>
}
