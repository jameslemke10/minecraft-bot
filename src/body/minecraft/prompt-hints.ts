import type { BodyHints } from '../types.js'

/** Shared body-hint blocks for Thalamus and PFC prompts. */
export function formatBodyHintsBlock(hints: BodyHints | undefined): string {
  if (!hints) return ''
  const parts: string[] = []
  parts.push(formatCraftBlock(hints))
  parts.push(formatMineableBlock(hints))
  return parts.filter(Boolean).join('\n')
}

function formatCraftBlock(hints: BodyHints): string {
  const header = `=== Craftable now (from body — use exact item names for craft) ===
crafting table nearby: ${hints.crafting_table_nearby ? 'yes' : 'no'}`
  if (hints.craftable.length === 0) {
    return `${header}
(nothing craftable with current inventory)

`
  }
  const lines = hints.craftable.map((c) => {
    const table = c.needs_table ? ' (needs crafting table)' : ''
    return `- ${c.item}: ${c.ingredients}${table}`
  })
  return `${header}
${lines.join('\n')}

`
}

function formatMineableBlock(hints: BodyHints): string {
  const header = `=== Mineable now (from body — ONLY valid mine(x,y,z) targets) ===
Use these exact coordinates for mine. Ref as source='body.mineable', id=<id>.
Buried ore veins in scene objects are NOT mine targets until they appear here.`
  if (hints.mineable.length === 0) {
    return `${header}
(nothing in reach — move closer or dig exposed blocks first)

`
  }
  const lines = hints.mineable.map(
    (m) => `- id=${m.id} (${m.x},${m.y},${m.z}) ${m.block} [${m.relation}]`
  )
  return `${header}
${lines.join('\n')}

`
}
