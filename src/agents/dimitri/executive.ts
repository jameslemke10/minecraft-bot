import { Type, type Schema } from '@google/genai'
import { config } from '../../config.js'
import { completeJson } from '../../llm/gemini.js'
import { logger } from '../../logger.js'
import type { Metrics } from '../../llm/metrics.js'
import type { RunLog } from '../run-log.js'
import { ActionSchema, type Action } from '../../body/minecraft/general/index.js'

/**
 * The executive — the big model. Sees ONLY the hydrated slice the curator
 * passed, and authors all content: a thought, optional durable notes, and one
 * action (whose kind is constrained to the verbs the curator put in play).
 */
export interface ExecutiveOutput {
  thought: string
  notes_to_add: string[]
  action: Action | null
}

interface RawExec {
  thought: string
  notes_to_add?: string[]
  action: { kind: string; args: Record<string, unknown> }
}

function buildSchema(verbs: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      thought: { type: Type.STRING },
      notes_to_add: { type: Type.ARRAY, items: { type: Type.STRING } },
      action: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: verbs.length > 0 ? verbs : ['wait'] },
          args: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER, nullable: true },
              y: { type: Type.NUMBER, nullable: true },
              z: { type: Type.NUMBER, nullable: true },
              count: { type: Type.NUMBER, nullable: true },
              ms: { type: Type.NUMBER, nullable: true },
              entityId: { type: Type.NUMBER, nullable: true },
              msg: { type: Type.STRING, nullable: true },
              block: { type: Type.STRING, nullable: true },
              item: { type: Type.STRING, nullable: true },
              input: { type: Type.STRING, nullable: true },
              fuel: { type: Type.STRING, nullable: true },
              dest: { type: Type.STRING, nullable: true },
            },
          },
        },
        required: ['kind', 'args'],
      },
    },
    required: ['thought', 'action'],
  }
}

function system(): string {
  return `You are Dimitri. Pursue your goal in this Minecraft world.

A curator has already selected everything below — your memory, your surroundings, and the actions available to you this tick. Decide based ONLY on what you see; if something you need isn't here, work with what you have. You think and act; you also write durable NOTES — notes are the ONLY way knowledge survives, because raw history is discarded. Write a note when you learn something worth remembering later (a location, what failed, a plan), and keep notes terse.

Pay attention to FAILED outcomes — don't repeat what just failed. Coordinates must come from what you were shown.

Return JSON: { "thought": "...", "notes_to_add": ["..."], "action": { "kind": "...", "args": {...} } }`
}

export async function decide(
  hydratedContext: string,
  verbs: string[],
  tick: number,
  metrics: Metrics,
  runLog?: RunLog
): Promise<ExecutiveOutput> {
  const result = await completeJson<RawExec>({
    caller: 'executive',
    metrics,
    model: config.gemini.modelDeliberate,
    system: system(),
    user: `=== Tick ${tick} ===\n\n${hydratedContext}\n\nChoose ONE action from "ACTIONS YOU MAY TAKE". Return JSON.`,
    schema: buildSchema(verbs),
    runLog,
  })

  const raw = result.data
  return {
    thought: (raw.thought ?? '').trim(),
    notes_to_add: (raw.notes_to_add ?? []).map((n) => n.trim()).filter(Boolean),
    action: validateAction(raw.action, verbs, tick),
  }
}

function validateAction(
  raw: { kind: string; args: Record<string, unknown> } | undefined,
  verbs: string[],
  tick: number
): Action | null {
  if (!raw) return null
  if (verbs.length > 0 && !verbs.includes(raw.kind)) {
    logger.warn({ tick, kind: raw.kind, verbs }, 'executive chose a verb not in play — rejecting')
    return null
  }
  // Drop null/undefined args so zod-optional fields parse as absent.
  const args: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw.args ?? {})) {
    if (v !== null && v !== undefined) args[k] = v
  }
  const parsed = ActionSchema.safeParse({ kind: raw.kind, args })
  if (!parsed.success) {
    logger.warn({ tick, raw, issues: parsed.error.issues }, 'executive returned invalid action')
    return null
  }
  return parsed.data
}
