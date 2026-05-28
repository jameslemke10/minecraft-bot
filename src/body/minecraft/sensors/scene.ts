import type { Bot } from 'mineflayer'
import { Vec3 as MFVec3 } from 'vec3'
import type { CompassDir, NearbyEntity, ScenePercept, SceneObject, Vec3 } from '../../types.js'

/**
 * Scene sensor — turns raw voxel data into a perceptual scene the LLM can
 * reason about.
 *
 * - heightmap: 16×16 viewer-relative top-down grid. Each cell is "<y><glyph>"
 *   where y is the top non-air block's y-coord and glyph encodes the kind
 *   of block (or entity overlay) at that column.
 * - objects: clustered named things — trees, water pools, ore veins, hostile
 *   mobs, aggregated arrows / passive mob groups, standalone interactables.
 */

const RADIUS = 8                // half-size of the heightmap (16×16 total)
const Y_SCAN_ABOVE = 8
const Y_SCAN_BELOW = 8

// Block-name → glyph used in the heightmap.
function glyphFor(blockName: string): string {
  if (blockName.endsWith('_log') || blockName.endsWith('_leaves')) return 'T'
  if (blockName === 'water' || blockName === 'lava') return '~'
  if (
    blockName === 'stone' ||
    blockName === 'cobblestone' ||
    blockName.startsWith('deepslate') ||
    blockName === 'andesite' ||
    blockName === 'granite' ||
    blockName === 'diorite'
  )
    return '#'
  return '.'
}

function isTreeBlock(name: string): boolean {
  return name.endsWith('_log') || name.endsWith('_leaves')
}

function isOreBlock(name: string): boolean {
  return name.endsWith('_ore')
}

const STANDALONE_KINDS = new Set([
  'chest', 'crafting_table', 'furnace', 'smoker', 'blast_furnace',
  'bed', 'white_bed', 'red_bed', 'blue_bed',
])

const HOSTILE_TYPES = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime',
  'phantom', 'drowned', 'husk', 'stray', 'pillager', 'vindicator', 'ravager',
  'wither_skeleton', 'blaze', 'ghast', 'magma_cube', 'silverfish',
])

const PASSIVE_TYPES = new Set([
  'cow', 'pig', 'chicken', 'sheep', 'horse', 'rabbit', 'fox', 'wolf', 'cat',
  'parrot', 'turtle', 'frog', 'axolotl', 'ocelot', 'panda', 'goat',
])

export function senseScene(bot: Bot, entities: readonly NearbyEntity[]): ScenePercept {
  const me = bot.entity.position
  if (!me) {
    return { heightmap: '(no position yet)', objects: [] }
  }
  const botX = Math.floor(me.x)
  const botY = Math.floor(me.y)
  const botZ = Math.floor(me.z)

  // 1. Build heightmap: scan each column for top non-air block.
  const tops: TopCell[][] = []
  for (let dz = -RADIUS; dz < RADIUS; dz++) {
    const row: TopCell[] = []
    for (let dx = -RADIUS; dx < RADIUS; dx++) {
      const col = topAt(bot, botX + dx, botY, botZ + dz)
      row.push(col)
    }
    tops.push(row)
  }

  // 2. Overlay entity glyphs onto the column they occupy.
  const entityOverlay = new Map<string, 'S' | 'P'>()
  for (const e of entities) {
    const ex = Math.floor(e.position.x) - botX
    const ez = Math.floor(e.position.z) - botZ
    if (ex < -RADIUS || ex >= RADIUS || ez < -RADIUS || ez >= RADIUS) continue
    const key = `${ex},${ez}`
    if (HOSTILE_TYPES.has(e.type) || isLikelyHostile(e.name)) {
      entityOverlay.set(key, 'S')
    } else if (PASSIVE_TYPES.has(e.type) || isLikelyPassive(e.name)) {
      if (!entityOverlay.has(key)) entityOverlay.set(key, 'P')
    }
  }

  // 3. Render heightmap as text (absolute world coords throughout).
  const heightmap = renderHeightmap(tops, entityOverlay, botX, botY, botZ)

  // 4. Build clustered objects.
  const objects: SceneObject[] = []
  clusterTrees(bot, botX, botY, botZ, objects)
  clusterWater(bot, botX, botY, botZ, objects)
  clusterOres(bot, botX, botY, botZ, objects)
  scanStandalones(bot, botX, botY, botZ, objects)
  clusterEntities(entities, me, objects)

  return { heightmap, objects }
}

interface TopCell {
  y: number
  name: string
  status: 'found' | 'unloaded' | 'deep'
}

function topAt(bot: Bot, x: number, by: number, z: number): TopCell {
  let sawLoaded = false
  for (let dy = Y_SCAN_ABOVE; dy >= -Y_SCAN_BELOW; dy--) {
    const block = bot.blockAt(new MFVec3(x, by + dy, z))
    if (block === null) continue // unloaded chunk at this height
    sawLoaded = true
    if (block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
      return { y: by + dy, name: block.name, status: 'found' }
    }
  }
  // Nothing solid found in the scan window.
  if (!sawLoaded) return { y: by - Y_SCAN_BELOW, name: 'air', status: 'unloaded' }
  return { y: by - Y_SCAN_BELOW, name: 'air', status: 'deep' }
}

function renderHeightmap(
  tops: TopCell[][],
  overlay: Map<string, 'S' | 'P'>,
  botX: number,
  botY: number,
  botZ: number
): string {
  const lines: string[] = []
  const colWidth = 6
  // Column header: world x of each column.
  const header =
    pad('z\\x', colWidth) +
    Array.from({ length: RADIUS * 2 }, (_, i) => pad(`${botX + (i - RADIUS)}`, colWidth)).join('')
  lines.push(header)

  for (let r = 0; r < tops.length; r++) {
    const dz = r - RADIUS
    const worldZ = botZ + dz
    const rowLabel = pad(`${worldZ}`, colWidth)
    const cells = tops[r]!.map((cell, c) => {
      const dx = c - RADIUS
      if (dx === 0 && dz === 0) return pad(`${cell.y}A`, colWidth)
      if (cell.status === 'unloaded') return pad('?', colWidth)
      let glyph = glyphFor(cell.name)
      const overlayGlyph = overlay.get(`${dx},${dz}`)
      if (overlayGlyph) glyph = overlayGlyph
      if (cell.status === 'deep') return pad(`<${cell.y}${glyph}`, colWidth)
      return pad(`${cell.y}${glyph}`, colWidth)
    })
    lines.push(`${rowLabel}${cells.join('')}`)
  }
  lines.push(
    `legend: cell = <surface_y><glyph> at that world (x,z). You (A) are at y=${botY}.`
  )
  lines.push(
    "        glyphs: .=open/ground, T=tree, ~=water/lava, #=stone, S=hostile, P=passive,"
  )
  lines.push(
    "        ?=chunk not loaded, '<'=surface is deeper than shown"
  )
  return lines.join('\n')
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

// --- Clustering helpers ---

function clusterTrees(
  bot: Bot,
  cx: number,
  cy: number,
  cz: number,
  out: SceneObject[]
): void {
  // Find all tree blocks within radius.
  const treePositions = bot.findBlocks({
    matching: (b) => isTreeBlock(b.name),
    maxDistance: RADIUS + 2,
    count: 256,
  })
  const visited = new Set<string>()
  let treeIdx = 0
  for (const pos of treePositions) {
    const key = `${pos.x},${pos.y},${pos.z}`
    if (visited.has(key)) continue
    const cluster = floodFill(bot, pos, (b) => isTreeBlock(b.name), visited)
    if (cluster.length === 0) continue
    // Trunk base = lowest oak_log y at the most common (x,z) column
    const logs = cluster.filter((p) => {
      const b = bot.blockAt(new MFVec3(p.x, p.y, p.z))
      return b ? b.name.endsWith('_log') : false
    })
    const trunkBase = logs.reduce<Vec3 | null>((acc, p) => {
      if (!acc || p.y < acc.y) return { x: p.x, y: p.y, z: p.z }
      return acc
    }, null) ?? { x: pos.x, y: pos.y, z: pos.z }
    const bbox = bboxOf(cluster)
    out.push({
      id: `oak_tree:${++treeIdx}`,
      kind: 'oak_tree',
      anchor: trunkBase,
      bbox,
      distance: distance(trunkBase, { x: cx, y: cy, z: cz }),
      dir: compassFromDelta(trunkBase.x - cx, trunkBase.z - cz),
      meta: {
        trunk_height: logs.length,
        has_leaves: cluster.some(
          (p) => bot.blockAt(new MFVec3(p.x, p.y, p.z))?.name.endsWith('_leaves')
        ),
      },
    })
  }
}

function clusterWater(
  bot: Bot,
  cx: number,
  cy: number,
  cz: number,
  out: SceneObject[]
): void {
  const positions = bot.findBlocks({
    matching: (b) => b.name === 'water',
    maxDistance: RADIUS + 2,
    count: 128,
  })
  const visited = new Set<string>()
  let idx = 0
  for (const pos of positions) {
    const key = `${pos.x},${pos.y},${pos.z}`
    if (visited.has(key)) continue
    const cluster = floodFill(bot, pos, (b) => b.name === 'water', visited)
    if (cluster.length === 0) continue
    const center = centerOf(cluster)
    out.push({
      id: `water:${++idx}`,
      kind: 'water_pool',
      anchor: center,
      bbox: bboxOf(cluster),
      distance: distance(center, { x: cx, y: cy, z: cz }),
      dir: compassFromDelta(center.x - cx, center.z - cz),
      meta: { area_blocks: cluster.length },
    })
  }
}

function clusterOres(
  bot: Bot,
  cx: number,
  cy: number,
  cz: number,
  out: SceneObject[]
): void {
  const positions = bot.findBlocks({
    matching: (b) => isOreBlock(b.name),
    maxDistance: RADIUS + 2,
    count: 128,
  })
  const visited = new Set<string>()
  let idx = 0
  for (const pos of positions) {
    const key = `${pos.x},${pos.y},${pos.z}`
    if (visited.has(key)) continue
    const seedBlock = bot.blockAt(pos)
    if (!seedBlock) continue
    const oreName = seedBlock.name
    const cluster = floodFill(bot, pos, (b) => b.name === oreName, visited)
    if (cluster.length === 0) continue
    const center = centerOf(cluster)
    out.push({
      id: `ore:${oreName}:${++idx}`,
      kind: 'ore_vein',
      anchor: center,
      bbox: bboxOf(cluster),
      distance: distance(center, { x: cx, y: cy, z: cz }),
      dir: compassFromDelta(center.x - cx, center.z - cz),
      meta: { ore: oreName, count: cluster.length },
    })
  }
}

function scanStandalones(
  bot: Bot,
  cx: number,
  cy: number,
  cz: number,
  out: SceneObject[]
): void {
  const positions = bot.findBlocks({
    matching: (b) => STANDALONE_KINDS.has(b.name),
    maxDistance: RADIUS + 2,
    count: 32,
  })
  let idx = 0
  for (const pos of positions) {
    const block = bot.blockAt(pos)
    if (!block) continue
    out.push({
      id: `${block.name}:${++idx}`,
      kind: block.name,
      anchor: { x: pos.x, y: pos.y, z: pos.z },
      distance: distance(pos, { x: cx, y: cy, z: cz }),
      dir: compassFromDelta(pos.x - cx, pos.z - cz),
    })
  }
}

function clusterEntities(
  entities: readonly NearbyEntity[],
  me: Vec3,
  out: SceneObject[]
): void {
  // Aggregate arrows into one object.
  const arrows = entities.filter((e) => e.name === 'arrow' || e.type === 'arrow')
  if (arrows.length > 0) {
    const nearest = arrows.reduce((acc, e) => (e.distance < acc.distance ? e : acc), arrows[0]!)
    out.push({
      id: 'incoming_arrows',
      kind: 'incoming_arrows',
      anchor: nearest.position,
      distance: nearest.distance,
      dir: compassFromDelta(nearest.position.x - me.x, nearest.position.z - me.z),
      meta: { count: arrows.length, nearest_distance: nearest.distance },
    })
  }

  // Hostile entities — one object each. `kind` is the species (e.name),
  // since mineflayer's e.type is the broad category ("hostile"/"mob").
  for (const e of entities) {
    if (e.name === 'arrow' || e.type === 'arrow') continue
    if (HOSTILE_TYPES.has(e.type) || isLikelyHostile(e.name)) {
      out.push({
        id: e.id,
        kind: e.name || e.type,
        anchor: e.position,
        distance: e.distance,
        dir: compassFromDelta(e.position.x - me.x, e.position.z - me.z),
        meta: { hostile: true },
      })
    }
  }

  // Passive entities — aggregate per-species when ≥3, otherwise individual.
  const passive = entities.filter(
    (e) =>
      e.name !== 'arrow' &&
      e.type !== 'arrow' &&
      !HOSTILE_TYPES.has(e.type) &&
      !isLikelyHostile(e.name) &&
      (PASSIVE_TYPES.has(e.type) || isLikelyPassive(e.name))
  )
  const bySpecies = new Map<string, NearbyEntity[]>()
  for (const e of passive) {
    const species = e.name || e.type
    const arr = bySpecies.get(species) ?? []
    arr.push(e)
    bySpecies.set(species, arr)
  }
  for (const [species, list] of bySpecies) {
    if (list.length >= 3) {
      const nearest = list.reduce((acc, e) => (e.distance < acc.distance ? e : acc), list[0]!)
      out.push({
        id: `passive_mob_group:${species}`,
        kind: 'passive_mob_group',
        anchor: nearest.position,
        distance: nearest.distance,
        dir: compassFromDelta(nearest.position.x - me.x, nearest.position.z - me.z),
        meta: { species, count: list.length, nearest_distance: nearest.distance },
      })
    } else {
      for (const e of list) {
        out.push({
          id: e.id,
          kind: e.name || e.type,
          anchor: e.position,
          distance: e.distance,
          dir: compassFromDelta(e.position.x - me.x, e.position.z - me.z),
          meta: { passive: true },
        })
      }
    }
  }
}

// --- Geometry helpers ---

function floodFill(
  bot: Bot,
  start: Vec3,
  matcher: (b: { name: string }) => boolean,
  visited: Set<string>
): Vec3[] {
  const queue: Vec3[] = [start]
  const cluster: Vec3[] = []
  while (queue.length > 0) {
    const pos = queue.shift()!
    const key = `${pos.x},${pos.y},${pos.z}`
    if (visited.has(key)) continue
    const block = bot.blockAt(new MFVec3(pos.x, pos.y, pos.z))
    if (!block || !matcher(block)) continue
    visited.add(key)
    cluster.push(pos)
    for (const [dx, dy, dz] of NEIGHBOR_6) {
      queue.push({ x: pos.x + dx, y: pos.y + dy, z: pos.z + dz })
    }
  }
  return cluster
}

const NEIGHBOR_6: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
]

function bboxOf(positions: Vec3[]): [Vec3, Vec3] {
  const first = positions[0]!
  const min: Vec3 = { x: first.x, y: first.y, z: first.z }
  const max: Vec3 = { x: first.x, y: first.y, z: first.z }
  for (const p of positions) {
    if (p.x < min.x) min.x = p.x
    if (p.y < min.y) min.y = p.y
    if (p.z < min.z) min.z = p.z
    if (p.x > max.x) max.x = p.x
    if (p.y > max.y) max.y = p.y
    if (p.z > max.z) max.z = p.z
  }
  return [min, max]
}

function centerOf(positions: Vec3[]): Vec3 {
  let sx = 0, sy = 0, sz = 0
  for (const p of positions) {
    sx += p.x
    sy += p.y
    sz += p.z
  }
  const n = positions.length
  return { x: Math.round(sx / n), y: Math.round(sy / n), z: Math.round(sz / n) }
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 10) / 10
}

function compassFromDelta(dx: number, dz: number): CompassDir {
  // Minecraft: +x = east, +z = south.
  const angle = Math.atan2(dz, dx) // -π to π
  const deg = ((angle * 180) / Math.PI + 360) % 360
  // 0 = east, 90 = south, 180 = west, 270 = north
  if (deg < 22.5 || deg >= 337.5) return 'E'
  if (deg < 67.5) return 'SE'
  if (deg < 112.5) return 'S'
  if (deg < 157.5) return 'SW'
  if (deg < 202.5) return 'W'
  if (deg < 247.5) return 'NW'
  if (deg < 292.5) return 'N'
  return 'NE'
}

function isLikelyHostile(name: string | undefined): boolean {
  if (!name) return false
  return HOSTILE_TYPES.has(name.toLowerCase())
}

function isLikelyPassive(name: string | undefined): boolean {
  if (!name) return false
  return PASSIVE_TYPES.has(name.toLowerCase())
}
