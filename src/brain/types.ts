import { z } from 'zod'
import type { RawPercept, Vec3 } from '../body/types.js'

// Re-export Vec3 so brain consumers can import it from one place.
export type { Vec3 } from '../body/types.js'
export type { RawPercept } from '../body/types.js'

// --- Actions (what the brain produces, what the body consumes) ---

export const MoveActionSchema = z.object({
  kind: z.literal('move'),
  args: z.object({
    x: z.number(),
    z: z.number(),
  }),
})

export const ChatActionSchema = z.object({
  kind: z.literal('chat'),
  args: z.object({
    msg: z.string().min(1).max(256),
  }),
})

export const WaitActionSchema = z.object({
  kind: z.literal('wait'),
  args: z.object({
    ms: z.number().int().positive().max(60_000),
  }),
})

export const MineActionSchema = z.object({
  kind: z.literal('mine'),
  args: z.object({
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
  }),
})

export const PlaceActionSchema = z.object({
  kind: z.literal('place'),
  args: z.object({
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    block: z.string().min(1),
  }),
})

export const CraftActionSchema = z.object({
  kind: z.literal('craft'),
  args: z.object({
    item: z.string().min(1),
    count: z.number().int().positive().max(64).optional(),
  }),
})

export const EquipActionSchema = z.object({
  kind: z.literal('equip'),
  args: z.object({
    item: z.string().min(1),
  }),
})

export const AttackActionSchema = z.object({
  kind: z.literal('attack'),
  args: z.object({
    entityId: z.number().int(),
  }),
})

export const EatActionSchema = z.object({
  kind: z.literal('eat'),
  args: z.object({
    item: z.string().min(1).optional(),
  }),
})

export const SleepActionSchema = z.object({
  kind: z.literal('sleep'),
  args: z.object({}),
})

export const ActionSchema = z.discriminatedUnion('kind', [
  MoveActionSchema,
  ChatActionSchema,
  WaitActionSchema,
  MineActionSchema,
  PlaceActionSchema,
  CraftActionSchema,
  EquipActionSchema,
  AttackActionSchema,
  EatActionSchema,
  SleepActionSchema,
])
export type Action = z.infer<typeof ActionSchema>

// --- Event log (unified history: thoughts, actions, damage, percept_change, chat) ---

export interface ThoughtEvent {
  kind: 'thought'
  tick: number
  text: string
  intention: string
}

export interface ActionEvent {
  kind: 'action'
  tick: number
  action: Action
}

export interface DamageEvent {
  kind: 'damage'
  tick: number
  amount: number
  source: string
}

export interface PerceptChangeEvent {
  kind: 'percept_change'
  tick: number
  delta: string
}

export interface ChatEvent {
  kind: 'chat'
  tick: number
  sender: string
  text: string
}

export type EventLogEntry =
  | ThoughtEvent
  | ActionEvent
  | DamageEvent
  | PerceptChangeEvent
  | ChatEvent

// --- Focus (Thalamus output → PFC input, transient per-tick) ---

/**
 * A pointer into the percept, event log, or WM. The schedule hydrates these
 * into FocusItems by looking up the referenced data.
 *
 * - source 'scene.objects' → id matches SceneObject.id
 * - source 'entities'      → id matches Entity.id (number)
 * - source 'events'        → tick + kind (matches latest event of that kind at that tick)
 * - source 'self'          → id is a self field name ('health', 'food', 'position', 'inventory')
 */
export interface FocusRef {
  source: 'scene.objects' | 'entities' | 'events' | 'self'
  id?: string | number
  tick?: number
  kind?: EventLogEntry['kind']
  why: string
}

/** Hydrated focus item: full data resolved from a FocusRef, ready for the PFC. */
export interface FocusItem {
  source: FocusRef['source']
  ref: string                // human-readable ref tag, e.g. "scene.objects/oak_tree:1"
  data: unknown              // the original object/entity/event/self-value
  why: string
}

export interface ThalamusOutput {
  focus_refs: FocusRef[]
  actions_in_play: string[]   // action names; empty = all actions
  brief?: string
}

// --- Working Memory (persistent) ---

export interface WorkingMemorySelf {
  position: Vec3
  yaw: number
  pitch: number
  health: number
  food: number
  on_ground: boolean
  in_water: boolean
  motion: 'still' | 'walking' | 'falling' | 'rising'
}

export interface WorkingMemory {
  identity: string
  self: WorkingMemorySelf
  intention: string
  event_log: EventLogEntry[]   // ring buffer, max 50
  tick: number
  timestamp: number
}

// --- Brain function type ---

/**
 * A brain is a function: percept → actions. Composition (serial, parallel)
 * lives at the call site. No interface required for v1.
 */
export type Brain = (percept: RawPercept) => Promise<Action[]>
