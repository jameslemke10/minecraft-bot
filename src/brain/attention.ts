import { Type, type Schema } from '@google/genai'
import { config } from '../config.js'
import { completeJson } from '../llm/gemini.js'
import type { RawPercept } from '../body/types.js'
import type { SalientItem, Thought } from './types.js'
import { ATTICUS_IDENTITY } from './identity.js'

/**
 * Attention — selective filter from raw perception to conscious awareness.
 * Biological analogue: thalamus.
 *
 * Reads the full RawPercept (the only module that does), plus a slice of
 * working memory (intention + recent thoughts), and returns the top items
 * Atticus should be consciously aware of right now.
 *
 * Uses the fast/cheap model — its job is fast filtering, not deep thought.
 */
export interface AttentionInput {
  percept: RawPercept
  intention: string
  recent_thoughts: readonly Thought[]
}

export interface AttentionOutput {
  salient: SalientItem[]
}

const SALIENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    salient: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          what: { type: Type.STRING },
          where: { type: Type.STRING },
          distance: { type: Type.NUMBER, nullable: true },
          why: { type: Type.STRING },
        },
        required: ['what', 'where', 'why'],
      },
    },
  },
  required: ['salient'],
}

const ATTENTION_SYSTEM = `${ATTICUS_IDENTITY}

Right now you are acting as Atticus's attentional filter — the thalamic gate \
between raw perception and conscious awareness.

Given everything Atticus's body senses, decide what is worth bringing into \
conscious awareness in this moment. Return at most 5 items.

Prioritize:
- Things that are unusual, new, or changed
- Things relevant to his current intention
- Anything that could matter for his wellbeing (low health, low food, hazards)
- Salient features of his environment that ground him in where he is

Do NOT invent details. Only describe what is literally present in the \
perception data. Each item must include a brief "why" — why it deserves \
conscious attention.`

export async function attention(input: AttentionInput): Promise<AttentionOutput> {
  const userPrompt = buildPrompt(input)

  const result = await completeJson<AttentionOutput>({
    caller: 'attention',
    model: config.gemini.modelFast,
    system: ATTENTION_SYSTEM,
    user: userPrompt,
    schema: SALIENT_SCHEMA,
  })

  return result.data
}

function buildPrompt(input: AttentionInput): string {
  const p = input.percept
  const inv =
    p.self.inventory.length === 0
      ? 'empty'
      : p.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')

  const blocks =
    p.nearby_blocks.length === 0
      ? 'nothing notable in range'
      : p.nearby_blocks
          .map((b) => `${b.type} at (${b.position.x},${b.position.y},${b.position.z}) ~${b.distance.toFixed(1)}m`)
          .join('; ')

  const entities =
    p.nearby_entities.length === 0
      ? 'none'
      : p.nearby_entities
          .map((e) => `${e.name} (${e.type}) ~${e.distance.toFixed(1)}m`)
          .join('; ')

  const events = p.recent_events.length === 0 ? 'none' : p.recent_events.slice(-5).join(' | ')

  const recentThoughts =
    input.recent_thoughts.length === 0
      ? 'none yet'
      : input.recent_thoughts.map((t) => `t${t.tick}: ${t.text}`).join(' | ')

  return `=== Raw Perception (tick ${p.tick}) ===

Self:
  position: (${p.self.position.x.toFixed(1)}, ${p.self.position.y.toFixed(1)}, ${p.self.position.z.toFixed(1)})
  yaw: ${p.self.yaw.toFixed(2)}, pitch: ${p.self.pitch.toFixed(2)}
  health: ${p.self.health}/20, food: ${p.self.food}/20
  on_ground: ${p.self.on_ground}, in_water: ${p.self.in_water}
  inventory: ${inv}
  held_item: ${p.self.held_item ?? 'nothing'}

Terrain:
  biome: ${p.terrain.biome}
  time_of_day: ${p.terrain.time_of_day} (tick ${p.terrain.time_ticks})
  weather: ${p.terrain.weather}
  block_at_feet: ${p.terrain.block_at_feet}
  block_looking_at: ${p.terrain.block_looking_at ?? 'nothing in range'}

Notable nearby blocks: ${blocks}
Nearby entities: ${entities}
Recent events: ${events}

=== Working Memory Slice ===
Current intention: ${input.intention || '(none set)'}
Recent thoughts: ${recentThoughts}

=== Task ===
Return JSON: { "salient": [...] }`
}
