import { Type, type Schema } from '@google/genai'
import { config } from '../../config.js'
import { completeJson } from '../../llm/gemini.js'
import type { Metrics } from '../../llm/metrics.js'
import type { RunLog } from '../run-log.js'
import { ACTION_DOCS, type Percept } from '../../body/minecraft/general/index.js'
import type { WorkingMemory, HistoryEntry, Note } from './wm.js'

/**
 * The curator — cheap, pure context-management. Reads the FULL working memory
 * + the live percept + the action catalog, and emits only refs:
 *   - pass:   everything the executive should see (goal, percept items, WM
 *             entries, AND which actions are in play) — forward-looking.
 *   - remove: GC over accumulating WM contents (history/notes ids) only.
 * It authors no content and cannot remove the goal.
 */
export interface CuratorOutput {
  pass: string[]
  remove: string[]
}

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    pass: { type: Type.ARRAY, items: { type: Type.STRING } },
    remove: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['pass'],
}

function system(): string {
  return `You are Dimitri's context curator — a fast pre-processor in front of a slower, smarter executive model.

Each tick you see Dimitri's FULL working memory and the live percept. You do TWO jobs and nothing else:

1) pass: choose every reference the executive should see this tick to make a GOOD DECISION AND PLAN. Be forward-looking, not myopic — include capabilities and facts relevant to the plan even if their prerequisites aren't met right now (e.g. include act:smelt so the executive learns it needs a furnace and can plan to build one). Choose which ACTIONS are in play by including act:<verb> refs — the executive can ONLY use verbs you pass. Omit only what is irrelevant to the current decision or plan. You author nothing; you only point.

2) remove: garbage-collect the working memory so it stays small. You may ONLY remove history (h#) and note (n#) ids. You can NEVER remove the goal. Knowledge survives only if it was written to a note — raw history (h#) is fodder; drop stale/superseded entries. Keep the most recent few history entries so the executive isn't blind to what just happened.

Return JSON: { "pass": ["goal","self","standing_on","notable:2","n1","h7","act:mine", ...], "remove": ["h1","h2", ...] }`
}

export async function curate(
  wm: WorkingMemory,
  percept: Percept,
  metrics: Metrics,
  runLog?: RunLog
): Promise<CuratorOutput> {
  const result = await completeJson<CuratorOutput>({
    caller: 'curator',
    metrics,
    model: config.gemini.modelFast,
    system: system(),
    user: buildPrompt(wm, percept),
    schema: SCHEMA,
    runLog,
  })
  return { pass: result.data.pass ?? [], remove: result.data.remove ?? [] }
}

function buildPrompt(wm: WorkingMemory, percept: Percept): string {
  return `GOAL (ref: "goal"): ${wm.goal}

=== WORKING MEMORY — history (ref by id; removable) ===
${wm.history.length === 0 ? '(empty)' : wm.history.map(renderHistory).join('\n')}

=== WORKING MEMORY — notes (ref by id; removable) ===
${wm.notes.length === 0 ? '(none)' : wm.notes.map(renderNote).join('\n')}

=== LIVE PERCEPT (transient — pass what matters; it is NOT stored) ===
${renderPerceptWithRefs(percept)}

=== ACTION CATALOG (ref as act:<verb>; pass the ones relevant to decision OR plan) ===
${ACTION_DOCS.map((a) => `- act:${a.name} — ${a.signature}: ${a.description}`).join('\n')}

=== TASK ===
Pick pass[] (refs the executive sees + act:<verb> it may use) and remove[] (h#/n# to GC).
Return JSON: { "pass": [...], "remove": [...] }`
}

function renderHistory(e: HistoryEntry): string {
  switch (e.kind) {
    case 'thought':
      return `${e.id} [t${e.tick} thought] "${e.text}"${e.intention ? ` (intention: ${e.intention})` : ''}`
    case 'action':
      return `${e.id} [t${e.tick} action] ${e.action.kind}(${JSON.stringify(e.action.args)})`
    case 'outcome':
      return `${e.id} [t${e.tick} outcome] ${e.actionKind} → ${e.ok ? 'ok' : 'FAILED'}: ${e.message}`
    case 'event':
      return `${e.id} [t${e.tick} event] ${e.text}`
  }
}

function renderNote(n: Note): string {
  return `${n.id} [t${n.tick}] ${n.text}`
}

function renderPerceptWithRefs(p: Percept): string {
  const near = p.surroundings.near
    .map((b, i) => `  near:${i} — ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`)
    .join('\n')
  const notable = p.surroundings.notable
    .map((b, i) => `  notable:${i} — ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`)
    .join('\n')
  const ents = p.entities
    .map((e) => `  ent:${e.id} — ${e.kind} (${e.distance}m)`)
    .join('\n')
  const inv = p.self.inventory.length === 0 ? 'empty' : p.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')
  const standing = p.surroundings.standing_on
    ? `${p.surroundings.standing_on.name} (${p.surroundings.standing_on.pos.x},${p.surroundings.standing_on.pos.y},${p.surroundings.standing_on.pos.z})`
    : 'NOTHING (over a drop)'

  return `ref "self": pos (${fix(p.self.position.x)},${fix(p.self.position.y)},${fix(p.self.position.z)}) health ${p.self.health}/20 food ${p.self.food}/20 held ${p.self.held_item ?? 'nothing'} | inventory: ${inv} | ${p.world.biome}, ${p.world.time_of_day}, ${p.world.weather}
ref "standing_on": ${standing}
near (ref near:i):
${near || '  (open)'}
notable out to ${p.surroundings.radius} (ref notable:i):
${notable || '  (none)'}
entities (ref ent:id):
${ents || '  (none)'}`
}

function fix(n: number): string {
  return n.toFixed(1)
}
