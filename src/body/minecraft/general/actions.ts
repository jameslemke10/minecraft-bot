import { z } from 'zod'
import type { ActionDoc } from '../../types.js'

/**
 * The general action vocabulary. Task-agnostic — the same verbs serve any
 * goal. The game does NOT surface "available actions"; this list is authored.
 * Each verb carries usage context (signature + description) so the model can
 * use it correctly; what is *valid right now* is learned from action outcomes,
 * not pre-filtered (affordances deferred).
 */

const coords = { x: z.number().int(), y: z.number().int(), z: z.number().int() }

export const ActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), args: z.object({ x: z.number(), z: z.number() }) }),
  z.object({ kind: z.literal('wait'), args: z.object({ ms: z.number().int().positive().max(60_000) }) }),
  z.object({ kind: z.literal('chat'), args: z.object({ msg: z.string().min(1).max(256) }) }),
  z.object({ kind: z.literal('mine'), args: z.object(coords) }),
  z.object({ kind: z.literal('place'), args: z.object({ ...coords, block: z.string().min(1) }) }),
  z.object({
    kind: z.literal('craft'),
    args: z.object({ item: z.string().min(1), count: z.number().int().positive().max(64).optional() }),
  }),
  z.object({
    kind: z.literal('smelt'),
    args: z.object({
      input: z.string().min(1),
      fuel: z.string().min(1),
      count: z.number().int().positive().max(64).optional(),
    }),
  }),
  z.object({
    kind: z.literal('equip'),
    args: z.object({
      item: z.string().min(1),
      dest: z.enum(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']).optional(),
    }),
  }),
  z.object({ kind: z.literal('eat'), args: z.object({ item: z.string().min(1).optional() }) }),
  z.object({ kind: z.literal('attack'), args: z.object({ entityId: z.number().int() }) }),
  z.object({ kind: z.literal('activate'), args: z.object(coords) }),
  z.object({
    kind: z.literal('drop'),
    args: z.object({ item: z.string().min(1), count: z.number().int().positive().optional() }),
  }),
  z.object({ kind: z.literal('sleep'), args: z.object({}) }),
])

export type Action = z.infer<typeof ActionSchema>
export type ActionKind = Action['kind']

export const ACTION_DOCS: readonly ActionDoc[] = [
  {
    name: 'move',
    signature: 'move(x, z)',
    description: 'Pathfind to absolute world coords (Y is automatic). Travel across the surface or to a known spot.',
  },
  {
    name: 'mine',
    signature: 'mine(x, y, z)',
    description:
      'Walk into reach and break the block at (x,y,z). Coords must come from your surroundings. Fails if out of reach or your tool cannot break it — read the outcome and adapt.',
  },
  {
    name: 'place',
    signature: 'place(x, y, z, block)',
    description:
      'Equip the named inventory block and place it at (x,y,z). Needs a solid block adjacent to place against, and an empty target. Use exact item names (e.g. "dirt", "cobblestone").',
  },
  {
    name: 'craft',
    signature: 'craft(item, count?)',
    description:
      'Craft an item by exact name from current inventory; walks to a nearby crafting table if the recipe needs one. Fails if you lack ingredients or a required table.',
  },
  {
    name: 'smelt',
    signature: 'smelt(input, fuel, count?)',
    description:
      'Use a nearby furnace: load fuel (e.g. "coal", "oak_planks") and input (e.g. "raw_iron"), wait, and collect the smelted output. Requires a furnace within reach — craft and place one first if needed.',
  },
  {
    name: 'equip',
    signature: 'equip(item, dest?)',
    description:
      'Hold an inventory item in your hand (default) or wear it as armor. dest ∈ hand, head, torso, legs, feet, off-hand.',
  },
  {
    name: 'eat',
    signature: 'eat(item?)',
    description: 'Consume a food item from inventory to restore hunger. If item is omitted, eats what you are holding.',
  },
  {
    name: 'attack',
    signature: 'attack(entityId)',
    description: 'Walk into reach of the entity with that id and hit it once. For combat or hunting animals.',
  },
  {
    name: 'activate',
    signature: 'activate(x, y, z)',
    description:
      'Use/interact with the block at (x,y,z): open a door or chest, press a button, etc. (For crafting/smelting use craft/smelt instead.)',
  },
  {
    name: 'drop',
    signature: 'drop(item, count?)',
    description: 'Toss items out of your inventory by name (all of them if count omitted).',
  },
  {
    name: 'sleep',
    signature: 'sleep()',
    description: 'Walk to a nearby bed and sleep. Only works at night in a safe area.',
  },
  {
    name: 'chat',
    signature: 'chat(msg)',
    description: 'Say something out loud. Other players hear it.',
  },
  {
    name: 'wait',
    signature: 'wait(ms)',
    description: 'Pause for ms milliseconds (max 60000) to let time pass or observe.',
  },
]
