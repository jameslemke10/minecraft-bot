import type { Percept } from './percept.js'

/**
 * Canonical text rendering of a percept. BOTH arms use this so the per-tick
 * observation text is identical — only the surrounding context mechanism
 * differs. Kept compact: the bounded cube is summarized, never dumped raw.
 */
export function renderPercept(p: Percept): string {
  const inv =
    p.self.inventory.length === 0
      ? 'empty'
      : p.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')

  const s = p.surroundings
  const standing = s.standing_on
    ? `${s.standing_on.name} at (${s.standing_on.pos.x},${s.standing_on.pos.y},${s.standing_on.pos.z})`
    : 'NOTHING (you are over a drop / falling)'

  const blockLine = (b: { name: string; pos: { x: number; y: number; z: number }; dist: number }): string =>
    `  - ${b.name} (${b.pos.x},${b.pos.y},${b.pos.z}) ${b.dist}m`

  const near = s.near.length === 0 ? '  (open space all around)' : s.near.map(blockLine).join('\n')
  const notable = s.notable.length === 0 ? '  (none)' : s.notable.map(blockLine).join('\n')

  const entities =
    p.entities.length === 0
      ? '(none)'
      : p.entities
          .map((e) => `  - id=${e.id} ${e.kind} (${e.distance}m)`)
          .join('\n')

  const events =
    p.new_events.length === 0
      ? '(none)'
      : p.new_events.map(renderEvent).join('\n')

  return `=== Tick ${p.tick} ===
STATUS: ${p.self.motion}${p.self.in_water ? ' (in water)' : ''}, health ${p.self.health}/20, food ${p.self.food}/20
self: pos (${fix(p.self.position.x)},${fix(p.self.position.y)},${fix(p.self.position.z)}) yaw ${p.self.yaw.toFixed(2)} pitch ${p.self.pitch.toFixed(2)} held: ${p.self.held_item ?? 'nothing'}
inventory: ${inv}
world: ${p.world.biome}, ${p.world.time_of_day}, ${p.world.weather}

standing on: ${standing}
nearby blocks (within ${s.near_radius}; absent coords = open/air):
${near}
notable blocks (out to ${s.radius}; ores/water/lava/etc):
${notable}

entities:
${entities}

events since last tick:
${events}`
}

function renderEvent(e: Percept['new_events'][number]): string {
  switch (e.kind) {
    case 'damage':
      return `  - damage ${e.amount} from ${e.source}`
    case 'chat':
      return `  - chat <${e.sender}> ${e.text}`
    case 'change':
      return `  - ${e.text}`
  }
}

function fix(n: number): string {
  return n.toFixed(1)
}
