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

export const ActionSchema = z.discriminatedUnion('kind', [
  MoveActionSchema,
  ChatActionSchema,
  WaitActionSchema,
])
export type Action = z.infer<typeof ActionSchema>

// --- Working Memory (the brain's shared workspace) ---

export interface SalientItem {
  what: string
  where: string
  distance: number | null
  why: string
}

export interface Thought {
  tick: number
  text: string
  intention: string
  action?: Action
}

export interface WorkingMemorySelf {
  position: Vec3
  yaw: number
  pitch: number
  health: number
  food: number
  on_ground: boolean
  in_water: boolean
}

export interface WorkingMemory {
  identity: string
  self: WorkingMemorySelf
  salient: SalientItem[]
  recent_thoughts: Thought[]
  intention: string
  tick: number
  timestamp: number
}

// --- Brain function type ---

/**
 * A brain is a function: percept → actions. Composition (serial, parallel)
 * lives at the call site. No interface required for v1.
 */
export type Brain = (percept: RawPercept) => Promise<Action[]>
