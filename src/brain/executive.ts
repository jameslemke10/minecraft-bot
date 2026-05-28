import { Type, type Schema } from '@google/genai'
import { config } from '../config.js'
import { completeJson } from '../llm/gemini.js'
import { logger } from '../logger.js'
import type { ActionDoc } from '../body/types.js'
import { ATTICUS_IDENTITY } from './identity.js'
import {
  ActionSchema,
  type Action,
  type EventLogEntry,
  type FocusItem,
  type ThoughtEvent,
  type WorkingMemorySelf,
} from './types.js'

/**
 * PFC — deliberation and action selection.
 *
 * Reads only what the Thalamus surfaced (hydrated focus + filtered action
 * menu) plus the always-on slice of WM (self, intention, recent events).
 * Never reads the raw percept directly.
 */
export interface ExecutiveInput {
  focus: readonly FocusItem[]
  self: WorkingMemorySelf
  intention: string
  recent_events: readonly EventLogEntry[]
  action_menu: readonly ActionDoc[]
  brief?: string
  tick: number
}

export interface ExecutiveOutput {
  thought: ThoughtEvent
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
        kind: {
          type: Type.STRING,
          enum: [
            'move', 'chat', 'wait',
            'mine', 'place', 'craft', 'equip', 'attack', 'eat', 'sleep',
          ],
        },
        args: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, nullable: true },
            y: { type: Type.NUMBER, nullable: true },
            z: { type: Type.NUMBER, nullable: true },
            msg: { type: Type.STRING, nullable: true },
            ms: { type: Type.NUMBER, nullable: true },
            block: { type: Type.STRING, nullable: true },
            item: { type: Type.STRING, nullable: true },
            count: { type: Type.NUMBER, nullable: true },
            entityId: { type: Type.NUMBER, nullable: true },
          },
        },
      },
      required: ['kind', 'args'],
    },
  },
  required: ['thought', 'intention', 'action'],
}

const EXEC_SYSTEM = `${ATTICUS_IDENTITY}

You are Atticus's prefrontal cortex — deliberation and one-action selection. \
The thalamus has already pruned your perception to a focus and a filtered \
action menu. Decide what to think and what to do.

Use only the focus, self, intention, recent events, and action menu in your \
user prompt. Do not invent coordinates or facts. Coordinates must come from \
focus items or recent events.

Return JSON: { "thought": "...", "intention": "...", "action": { "kind": "...", "args": {...} } }`

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

  const thought: ThoughtEvent = {
    kind: 'thought',
    tick: input.tick,
    text: raw.thought.trim(),
    intention: raw.intention.trim(),
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
  const focusBlock =
    input.focus.length === 0
      ? '(nothing in focus)'
      : input.focus
          .map(
            (f, i) =>
              `${i + 1}. ${f.ref} — ${f.why}\n   data: ${JSON.stringify(f.data)}`
          )
          .join('\n')

  const events =
    input.recent_events.length === 0
      ? '(none)'
      : input.recent_events.map(renderEvent).join('\n')

  const menu =
    input.action_menu.length === 0
      ? '(no actions available)'
      : input.action_menu
          .map((a) => `- ${a.signature}: ${a.description}`)
          .join('\n')

  const briefLine = input.brief ? `\nthalamus brief: ${input.brief}\n` : '\n'

  return `=== Tick ${input.tick} ===

STATUS: ${statusLine(input.self)}, health ${input.self.health}/20, food ${input.self.food}/20

You (self):
  position: (${input.self.position.x.toFixed(1)}, ${input.self.position.y.toFixed(1)}, ${input.self.position.z.toFixed(1)})
  on_ground: ${input.self.on_ground}, in_water: ${input.self.in_water}

Current intention: ${input.intention || '(none set)'}
${briefLine}
=== Focus (what the thalamus surfaced) ===
${focusBlock}

=== Recent events ===
${events}

=== Available actions ===
${menu}

=== Task ===
Choose ONE action. Return JSON: { "thought": "...", "intention": "...", "action": { "kind": "...", "args": {...} } }

In args, include only the fields the chosen action needs; leave others null.`
}

function statusLine(self: WorkingMemorySelf): string {
  if (self.motion === 'falling') return 'FALLING'
  if (self.motion === 'rising') return 'rising'
  if (self.in_water) return 'in water'
  if (!self.on_ground) return 'airborne'
  if (self.motion === 'walking') return 'walking'
  return 'standing still'
}

function renderEvent(e: EventLogEntry): string {
  switch (e.kind) {
    case 'thought':
      return `t${e.tick} thought: "${e.text}" (intention: ${e.intention})`
    case 'action':
      return `t${e.tick} action: ${e.action.kind}(${JSON.stringify(e.action.args)})`
    case 'damage':
      return `t${e.tick} damage: -${e.amount} from ${e.source}`
    case 'percept_change':
      return `t${e.tick} change: ${e.delta}`
    case 'chat':
      return `t${e.tick} chat <${e.sender}> ${e.text}`
  }
}
