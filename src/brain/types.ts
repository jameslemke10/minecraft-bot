import { z } from 'zod'

export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
})
export type Vec3 = z.infer<typeof Vec3Schema>

export const InventoryItemSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
})
export type InventoryItem = z.infer<typeof InventoryItemSchema>

export const NearbyEntitySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  position: Vec3Schema,
  distance: z.number().nonnegative(),
})
export type NearbyEntity = z.infer<typeof NearbyEntitySchema>

export const WorldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  timestamp: z.number(),
  position: Vec3Schema,
  yaw: z.number(),
  pitch: z.number(),
  health: z.number(),
  food: z.number(),
  inventory: z.array(InventoryItemSchema),
  nearbyEntities: z.array(NearbyEntitySchema),
  recentEvents: z.array(z.string()),
  goal: z.string(),
})
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>

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

export type Brain = (snapshot: WorldSnapshot) => Promise<Action[]>
