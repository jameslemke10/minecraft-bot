import { Type, type Schema } from '@google/genai'
import { config } from '../config.js'
import { completeJson } from '../llm/gemini.js'
import { logger } from '../logger.js'
import { ATTICUS_IDENTITY } from './identity.js'
import {
  ActionSchema,
  type Action,
  type SalientItem,
  type Thought,
  type WorkingMemorySelf,
} from './types.js'

/**
 * Executive — deliberation, decision, action selection.
 * Biological analogue: prefrontal cortex (PFC).
 *
 * Reads a slice of working memory (NOT the raw percept — Attention has
 * already filtered for it) and returns a thought + intention update + an
 * action to take. Uses the more thoughtful model.
 */
export interface ExecutiveInput {
  self: WorkingMemorySelf
  salient: readonly SalientItem[]
  intention: string
  recent_thoughts: readonly Thought[]
  tick: number
}

export interface ExecutiveOutput {
  thought: Thought
  intention: string
  action: Action | null
}

interface RawExecutiveResponse {
  thought: string
  intention: string
  action: { kind: string; args: Record<string, unknown> }
}

const EXEC_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    thought: { type: Type.STRING },
    intention: { type: Type.STRING },
    action: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ['move', 'chat', 'wait'] },
        args: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, nullable: true },
            z: { type: Type.NUMBER, nullable: true },
            msg: { type: Type.STRING, nullable: true },
            ms: { type: Type.NUMBER, nullable: true },
          },
        },
      },
      required: ['kind', 'args'],
    },
  },
  required: ['thought', 'intention', 'action'],
}

const EXEC_SYSTEM = `${ATTICUS_IDENTITY}

Right now you are deliberating — the prefrontal cortex of your mind. You \
have already filtered your raw perception down to a few salient items. Now \
choose what to do.

You have three available actions:
- move(x, z): pathfind to absolute world coordinates (Y is automatic)
- chat(msg): say something out loud
- wait(ms): pause for a number of milliseconds (max 10000)

Return JSON with:
- thought: a single first-person sentence of your inner monologue (what you \
  notice, what you want, what you're going to do and why)
- intention: a short phrase describing what you are now trying to do (e.g. \
  "head toward the oak tree", "rest by the water")
- action: ONE concrete action to take this tick

You may set the same intention as before if it's still right. Don't \
hallucinate sensations not in your working memory. Be honest about what \
you actually know.`

export async function executive(input: ExecutiveInput): Promise<ExecutiveOutput> {
  const userPrompt = buildPrompt(input)

  const result = await completeJson<RawExecutiveResponse>({
    caller: 'executive',
    model: config.gemini.modelDeliberate,
    system: EXEC_SYSTEM,
    user: userPrompt,
    schema: EXEC_SCHEMA,
  })

  const raw = result.data
  const action = validateAction(raw.action, input.tick)

  const thought: Thought = {
    tick: input.tick,
    text: raw.thought.trim(),
    intention: raw.intention.trim(),
    ...(action ? { action } : {}),
  }

  return {
    thought,
    intention: raw.intention.trim(),
    action,
  }
}

function validateAction(
  raw: { kind: string; args: Record<string, unknown> } | undefined,
  tick: number
): Action | null {
  if (!raw) return null
  const parsed = ActionSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn(
      { tick, raw, issues: parsed.error.issues },
      'executive returned invalid action'
    )
    return null
  }
  return parsed.data
}

function buildPrompt(input: ExecutiveInput): string {
  const salient =
    input.salient.length === 0
      ? '(nothing in conscious awareness)'
      : input.salient
          .map(
            (s, i) =>
              `${i + 1}. ${s.what} — ${s.where}${
                s.distance !== null ? ` (${s.distance.toFixed(1)}m)` : ''
              } — ${s.why}`
          )
          .join('\n')

  const recent =
    input.recent_thoughts.length === 0
      ? '(none yet)'
      : input.recent_thoughts
          .map((t) => `t${t.tick}: "${t.text}"${t.action ? ` → ${t.action.kind}` : ''}`)
          .join('\n')

  return `=== Working Memory (tick ${input.tick}) ===

You (self):
  position: (${input.self.position.x.toFixed(1)}, ${input.self.position.y.toFixed(1)}, ${input.self.position.z.toFixed(1)})
  health: ${input.self.health}/20, food: ${input.self.food}/20
  on_ground: ${input.self.on_ground}, in_water: ${input.self.in_water}

Conscious awareness (salient):
${salient}

Current intention: ${input.intention || '(none set)'}

Recent thoughts:
${recent}

=== Task ===
Return JSON: { "thought": "...", "intention": "...", "action": { "kind": "...", "args": {...} } }`
}
