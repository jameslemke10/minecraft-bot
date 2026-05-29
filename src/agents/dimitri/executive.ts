import { Type, type Schema } from '@google/genai'
import { completeJson } from '../../llm/gemini.js'
import type { Metrics } from '../../llm/metrics.js'
import type { RunLog } from '../run-log.js'
import type { Action } from '../../body/minecraft/general/index.js'
import { validateExecutiveAction } from './validate-action.js'
import { dimitriModels } from './models.js'

/**
 * The executive — the big model. Sees ONLY the hydrated slice the curator
 * passed, and authors all content: a thought, optional durable notes, and one
 * action (whose kind is constrained to the verbs the curator put in play).
 */
export interface ExecutiveOutput {
  thought: string
  notes_to_add: string[]
  action: Action | null
  /** When the model returned an action that failed validation. */
  actionError?: string
  attemptedKind?: string
}

interface RawExec {
  thought: string
  notes_to_add?: string[]
  action: { kind: string; args: Record<string, unknown> }
}

function buildSchema(verbs: string[]): Schema {
  const placeActive = verbs.includes('place')
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
              block: {
                type: Type.STRING,
                nullable: true,
                ...(placeActive
                  ? { description: 'REQUIRED when kind=place — exact inventory item name (e.g. crafting_table)' }
                  : {}),
              },
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

A curator has already selected everything below — your memory, your surroundings, and the actions available to you this tick. Decide based ONLY on what you see; if something you need isn't here, work with what you have. You think and act; you also write durable NOTES — notes are the ONLY way knowledge survives, because raw history is discarded. Write a note when you learn something worth remembering later (a location, what failed, a plan step), and keep notes terse.

Read FAILED outcomes in your memory — they tell you exactly what went wrong. Do NOT repeat the same action when the last outcome failed with the same reason.

Action guidance:
- move(x, z, y?): x and z are required; optional y targets a specific height (descend from trees, climb to a ledge). If move fails with "already at target x,z", repeating the same coordinates will NOT help — pick different x/z, add y, mine blocks below you, or wait.
- place(x, y, z, block): block is REQUIRED — exact inventory item name (e.g. crafting_table) plus coordinates. Empty air at the target; needs a solid block adjacent.
- mine(x, y, z): use ONLY coordinates from the mineable list — those blocks are in reach right now. Notable/x-ray ores are NOT valid until they appear in mineable. If mineable is empty, mine adjacent dirt/stone first or move closer. Do NOT invent coords from memory.
- If near shows dirt/stone between you and a notable ore, you must clear adjacent blocks or move — you cannot mine through walls.
- Planning: obtaining a diamond is a long multi-stage trip (wood → stone → iron → deep mine). Plan stages ahead; use notes for landmarks, ore sightings, and lessons from failures.

Coordinates for mine/place/move must come from what you were shown this tick.

Return JSON: { "thought": "...", "notes_to_add": ["..."], "action": { "kind": "...", "args": {...} } }`
}

function actionReminders(verbs: readonly string[]): string {
  const lines: string[] = []
  if (verbs.includes('place')) {
    lines.push('place REQUIRES args: { x, y, z, block } — block is the exact inventory item name.')
  }
  if (verbs.includes('move')) {
    lines.push('move accepts { x, z, y? } — include y when you need a specific height.')
  }
  if (verbs.includes('mine')) {
    lines.push('mine: use ONLY (x,y,z) from the mineable list — not notable/x-ray coords.')
  }
  return lines.length ? '\n\n' + lines.join('\n') : ''
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
    model: dimitriModels.executive,
    system: system(),
    user:
      `=== Tick ${tick} ===\n\n${hydratedContext}\n\n` +
      `Choose ONE action from "ACTIONS YOU MAY TAKE". Return JSON.` +
      actionReminders(verbs),
    schema: buildSchema(verbs),
    runLog,
  })

  const raw = result.data
  const attempt = validateExecutiveAction(raw.action, verbs, tick)
  return {
    thought: (raw.thought ?? '').trim(),
    notes_to_add: (raw.notes_to_add ?? []).map((n) => n.trim()).filter(Boolean),
    action: attempt.action,
    ...(attempt.error ? { actionError: attempt.error, attemptedKind: attempt.attemptedKind } : {}),
  }
}
