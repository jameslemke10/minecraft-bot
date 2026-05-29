import { ACTION_DOCS, type MineableBlock, type Percept } from '../../body/minecraft/general/index.js'
import { logger } from '../../logger.js'
import type { WorkingMemory, HistoryEntry, Note } from './wm.js'

/**
 * Expand the curator's `pass` refs into the executive's prompt + the set of
 * action verbs it may use. The executive sees ONLY what is returned here.
 */
export interface Hydrated {
  context: string
  verbs: string[]
}

const ACTION_BY_NAME = new Map(ACTION_DOCS.map((a) => [a.name, a]))

export function hydrate(pass: readonly string[], wm: WorkingMemory, percept: Percept): Hydrated {
  const lines: string[] = []
  const memory: string[] = []
  const surroundings: string[] = []
  const verbs: string[] = []
  const actionDocs: string[] = []

  for (const ref of pass) {
    const r = ref.trim()
    if (r === 'goal') {
      lines.push(`GOAL: ${wm.goal}`)
    } else if (r === 'self') {
      surroundings.push(renderSelf(percept))
    } else if (r === 'standing_on') {
      surroundings.push(`standing on: ${renderStandingOn(percept)}`)
    } else if (r === 'near') {
      surroundings.push('near:\n' + renderBlocks(percept.surroundings.near))
    } else if (r.startsWith('near:')) {
      const b = percept.surroundings.near[idx(r)]
      if (b) surroundings.push(`near: ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`)
    } else if (r === 'notable') {
      surroundings.push('notable:\n' + renderBlocks(percept.surroundings.notable))
    } else if (r.startsWith('notable:')) {
      const b = percept.surroundings.notable[idx(r)]
      if (b) surroundings.push(`notable (x-ray, NOT mineable): ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`)
    } else if (r === 'mineable') {
      surroundings.push('mineable (ONLY valid mine targets):\n' + renderMineable(percept.mineable))
    } else if (r.startsWith('mineable:')) {
      const m = findMineable(percept, r)
      if (m) surroundings.push(`mineable: ${m.name} (${m.pos.x},${m.pos.y},${m.pos.z}) ${m.dist}m [${m.relation}]`)
    } else if (r.startsWith('ent:')) {
      const id = Number(r.slice(4))
      const e = percept.entities.find((x) => x.id === id)
      if (e) surroundings.push(`entity: id=${e.id} ${e.kind} (${e.distance}m)`)
    } else if (r.startsWith('act:')) {
      const verb = r.slice(4)
      const doc = ACTION_BY_NAME.get(verb)
      if (doc) {
        verbs.push(verb)
        actionDocs.push(`- ${doc.signature}: ${doc.description}`)
      } else {
        logger.warn({ ref: r }, 'curator passed unknown action verb — skipping')
      }
    } else if (r.startsWith('h') || r.startsWith('n')) {
      const entry = wm.findById(r)
      if (entry) memory.push(renderEntry(entry))
      else logger.warn({ ref: r }, 'curator passed unresolved WM id — skipping')
    } else {
      logger.warn({ ref: r }, 'curator passed unknown ref — skipping')
    }
  }

  const sections: string[] = []
  if (lines.length) sections.push(lines.join('\n'))
  if (surroundings.length) sections.push('=== SURROUNDINGS / STATE ===\n' + surroundings.join('\n'))
  if (memory.length) sections.push('=== MEMORY (passed by curator) ===\n' + memory.join('\n'))
  sections.push(
    '=== ACTIONS YOU MAY TAKE ===\n' +
      (actionDocs.length ? actionDocs.join('\n') : '(none passed — you cannot act this tick)')
  )

  return { context: sections.join('\n\n'), verbs }
}

function idx(ref: string): number {
  return Number(ref.split(':')[1])
}

function renderSelf(p: Percept): string {
  const inv = p.self.inventory.length === 0 ? 'empty' : p.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')
  return `self: pos (${fix(p.self.position.x)},${fix(p.self.position.y)},${fix(p.self.position.z)}) health ${p.self.health}/20 food ${p.self.food}/20 held ${p.self.held_item ?? 'nothing'} motion ${p.self.motion} | inventory: ${inv} | ${p.world.biome}, ${p.world.time_of_day}, ${p.world.weather}`
}

function renderStandingOn(p: Percept): string {
  const s = p.surroundings.standing_on
  return s ? `${s.name} (${s.pos.x},${s.pos.y},${s.pos.z})` : 'NOTHING (over a drop / falling)'
}

function renderBlocks(blocks: readonly { name: string; pos: { x: number; y: number; z: number }; dist: number }[]): string {
  if (blocks.length === 0) return '  (none)'
  return blocks.map((b) => `  - ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`).join('\n')
}

function renderMineable(blocks: readonly MineableBlock[]): string {
  if (blocks.length === 0) return '  (none in reach — move closer or mine adjacent blocks first)'
  return blocks
    .map((m) => `  - ${m.id}: ${m.name} (${m.pos.x},${m.pos.y},${m.pos.z}) ${m.dist}m [${m.relation}]`)
    .join('\n')
}

function findMineable(p: Percept, ref: string): MineableBlock | undefined {
  const byId = p.mineable.find((m) => m.id === ref)
  if (byId) return byId
  const n = Number(ref.split(':')[1])
  return Number.isFinite(n) ? p.mineable[n] : undefined
}

function renderEntry(entry: HistoryEntry | Note): string {
  if (!('kind' in entry)) return `[note t${entry.tick}] ${entry.text}` // Note
  switch (entry.kind) {
    case 'thought':
      return `[t${entry.tick} thought] "${entry.text}"${entry.intention ? ` (intention: ${entry.intention})` : ''}`
    case 'action':
      return `[t${entry.tick} action] ${entry.action.kind}(${JSON.stringify(entry.action.args)})`
    case 'outcome':
      return `[t${entry.tick} outcome] ${entry.actionKind} → ${entry.ok ? 'ok' : 'FAILED'}: ${entry.message}`
    case 'event':
      return `[t${entry.tick} event] ${entry.text}`
  }
}

function fix(n: number): string {
  return n.toFixed(1)
}
