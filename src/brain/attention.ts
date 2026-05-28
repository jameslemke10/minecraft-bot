import { Type, type Schema } from '@google/genai'
import { config } from '../config.js'
import { completeJson } from '../llm/gemini.js'
import type { RawPercept } from '../body/types.js'
import type { EventLogEntry, ThalamusOutput } from './types.js'
import { ATTICUS_IDENTITY } from './identity.js'

/**
 * Thalamus — the funnel between raw perception and the PFC.
 *
 * Reads: full percept, current intention, recent events, full action menu names.
 * Emits: focus_refs (pointers into percept/events/self), actions_in_play
 * (subset of action names that matter given the focus), optional brief.
 *
 * Output is intentionally tiny — the schedule hydrates each ref against the
 * original data before passing to the PFC, so the LLM never has to act as
 * a stenographer for percept data we already have structured.
 */
export interface AttentionInput {
  percept: RawPercept
  intention: string
  recent_events: readonly EventLogEntry[]
  action_names: readonly string[]
}

export type AttentionOutput = ThalamusOutput

const THALAMUS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    focus_refs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.STRING,
            enum: ['scene.objects', 'entities', 'events', 'self'],
          },
          id: { type: Type.STRING, nullable: true },
          tick: { type: Type.NUMBER, nullable: true },
          kind: { type: Type.STRING, nullable: true },
          why: { type: Type.STRING },
        },
        required: ['source', 'why'],
      },
    },
    actions_in_play: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    brief: { type: Type.STRING, nullable: true },
  },
  required: ['focus_refs', 'actions_in_play'],
}

const ATTENTION_SYSTEM = `${ATTICUS_IDENTITY}

You are Atticus's thalamus — the attentional filter between raw perception \
and conscious deliberation. Each tick you read the percept and decide what \
the prefrontal cortex should think about, and which actions are relevant.

You do NOT restate or paraphrase the percept. You emit short refs pointing \
into the original data, plus a list of action names that matter right now, \
plus an optional one-sentence brief.

Return JSON: { "focus_refs": [...], "actions_in_play": [...], "brief": "..." }`

export async function attention(input: AttentionInput): Promise<AttentionOutput> {
  const userPrompt = buildPrompt(input)

  const result = await completeJson<ThalamusOutput>({
    caller: 'attention',
    model: config.gemini.modelFast,
    system: ATTENTION_SYSTEM,
    user: userPrompt,
    schema: THALAMUS_SCHEMA,
  })

  // Normalize: ids come back as strings even when they should be numbers
  // (entities). Try to coerce known-numeric refs.
  const focus_refs = result.data.focus_refs.map((r) => {
    if (r.source === 'entities' && typeof r.id === 'string' && /^\d+$/.test(r.id)) {
      return { ...r, id: Number(r.id) }
    }
    return r
  })

  return {
    focus_refs,
    actions_in_play: result.data.actions_in_play ?? [],
    ...(result.data.brief ? { brief: result.data.brief } : {}),
  }
}

function buildPrompt(input: AttentionInput): string {
  const p = input.percept
  const inv =
    p.self.inventory.length === 0
      ? '[]'
      : p.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')

  const objects =
    p.scene.objects.length === 0
      ? '(no notable objects)'
      : p.scene.objects
          .map((o) => {
            const meta = o.meta ? ` ${JSON.stringify(o.meta)}` : ''
            const bbox = o.bbox
              ? ` bbox[(${o.bbox[0].x},${o.bbox[0].y},${o.bbox[0].z})..(${o.bbox[1].x},${o.bbox[1].y},${o.bbox[1].z})]`
              : ''
            return `- id=${JSON.stringify(o.id)} kind=${o.kind} anchor=(${o.anchor.x},${o.anchor.y},${o.anchor.z}) dist=${o.distance.toFixed(1)}m dir=${o.dir}${bbox}${meta}`
          })
          .join('\n')

  const entities =
    p.nearby_entities.length === 0
      ? '(none)'
      : p.nearby_entities
          .map(
            (e) =>
              `- id=${e.id} ${e.name} (${e.type}) at (${e.position.x.toFixed(0)},${e.position.y.toFixed(0)},${e.position.z.toFixed(0)}) ~${e.distance.toFixed(1)}m`
          )
          .join('\n')

  const recent =
    input.recent_events.length === 0
      ? '(none)'
      : input.recent_events.map(renderEvent).join('\n')

  const status = `STATUS: ${motionVerb(p.self.motion)} on ${p.terrain.block_at_feet}` +
    `${p.self.in_water ? ' (in water)' : ''}` +
    `, health ${p.self.health}/20, food ${p.self.food}/20, inventory: ${inv}`

  return `${status}

=== Self (tick ${p.tick}) ===
position: (${p.self.position.x.toFixed(1)}, ${p.self.position.y.toFixed(1)}, ${p.self.position.z.toFixed(1)})  motion: ${p.self.motion}  on_ground: ${p.self.on_ground}
yaw: ${p.self.yaw.toFixed(2)}, pitch: ${p.self.pitch.toFixed(2)}
held_item: ${p.self.held_item ?? 'nothing'}

=== Terrain ===
biome: ${p.terrain.biome}, time: ${p.terrain.time_of_day} (${p.terrain.time_ticks}), weather: ${p.terrain.weather}
block_looking_at: ${p.terrain.block_looking_at ?? 'nothing in range'}

=== Scene (16×16 surface grid around you; columns/rows are world x/z, cells are surface_y + glyph) ===
\`\`\`
${p.scene.heightmap}
\`\`\`

Scene objects (refs available as source='scene.objects', id=...):
${objects}

Raw entities (refs available as source='entities', id=<number>):
${entities}

=== Recent events (refs available as source='events', tick + kind) ===
${recent}

=== Working memory ===
intention: ${input.intention || '(none set)'}

=== Available actions (filter into actions_in_play) ===
${input.action_names.join(', ')}

=== Task ===
Decide what should be in the PFC's focus this tick.

Rules:
- focus_refs: short list (2-5 typical; hard ceiling 15) of pointers into the \
data above. Each ref has: source ∈ {scene.objects, entities, events, self}, \
an id (object id, entity id as a string of digits, or self field name like \
"health"/"food"/"position"/"inventory"), an optional tick+kind for events, \
and a "why" fragment under 10 words.
- actions_in_play: which action names matter given the focus. If under \
threat: combat + movement. If safe and gathering: mine/craft/equip. If \
empty list, the PFC sees all actions — pass empty when uncertain.
- brief: optional one-sentence summation of the situation. Useful when the \
focus list alone wouldn't communicate the gist.

Be choosy. Less is better focus. Do not invent things not in the percept.

Return JSON: { "focus_refs": [...], "actions_in_play": [...], "brief": "..." }`
}

function motionVerb(m: import('../body/types.js').Motion): string {
  switch (m) {
    case 'still': return 'standing'
    case 'walking': return 'walking'
    case 'falling': return 'FALLING'
    case 'rising': return 'rising'
  }
}

function renderEvent(e: EventLogEntry): string {
  switch (e.kind) {
    case 'thought':
      return `- t${e.tick} thought: "${e.text}" (intention: ${e.intention})`
    case 'action':
      return `- t${e.tick} action: ${e.action.kind}(${JSON.stringify(e.action.args)})`
    case 'damage':
      return `- t${e.tick} damage: ${e.amount} from ${e.source}`
    case 'percept_change':
      return `- t${e.tick} change: ${e.delta}`
    case 'chat':
      return `- t${e.tick} chat <${e.sender}> ${e.text}`
  }
}
