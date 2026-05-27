/**
 * Environment-agnostic body contracts. Brain modules import from here.
 *
 * `Body<TAction>` is generic so different environments can define their own
 * Action types without this file knowing about them. Minecraft uses the
 * Action type from brain/types.ts.
 */

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

export interface SelfPercept {
  position: Vec3
  yaw: number
  pitch: number
  health: number
  food: number
  on_ground: boolean
  in_water: boolean
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

export interface RawPercept {
  self: SelfPercept
  terrain: TerrainPercept
  nearby_blocks: NearbyBlock[]
  nearby_entities: NearbyEntity[]
  recent_events: string[]
  tick: number
  timestamp: number
}

/**
 * The contract every environment must implement.
 *
 * sense() returns a snapshot of the world from the agent's perspective.
 * execute() dispatches a typed action into the environment.
 * disconnect() releases env resources cleanly.
 */
export interface Body<TAction = unknown> {
  envName: string
  sense(): Promise<RawPercept>
  execute(action: TAction): Promise<void>
  disconnect(): void
}
