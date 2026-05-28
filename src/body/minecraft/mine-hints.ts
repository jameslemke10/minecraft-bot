import type { Bot } from 'mineflayer'
import { Vec3 as MFVec3 } from 'vec3'
import type { MineOption } from '../types.js'

const SCAN_RADIUS = 4
const MAX_OPTIONS = 15
const MAX_REACH = 4.5

const DIG_DOWN_RE =
  /\b(dig|down|descend|descent|cave|ravine|underground|lower|depth|tunnel|shaft|y-level|below|into the ground)\b/i
const WOOD_RE = /\b(wood|tree|log|plank|chop|lumber)\b/i

interface Candidate {
  option: MineOption
  score: number
}

/**
 * Blocks the bot can actually break from its current position — the only
 * valid mine(x,y,z) targets. Mirrors describeCraftable for mining.
 */
export function describeMineable(bot: Bot, intention = ''): MineOption[] {
  const me = bot.entity?.position
  if (!me) return []

  const feetY = Math.floor(me.y)
  const bx = Math.floor(me.x)
  const bz = Math.floor(me.z)
  const digDown = DIG_DOWN_RE.test(intention)
  const wantWood = WOOD_RE.test(intention)

  const seen = new Set<string>()
  const candidates: Candidate[] = []

  for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
    for (let dy = -SCAN_RADIUS; dy <= SCAN_RADIUS; dy++) {
      for (let dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz++) {
        const x = bx + dx
        const y = feetY + dy
        const z = bz + dz
        const key = `${x},${y},${z}`
        if (seen.has(key)) continue

        const block = bot.blockAt(new MFVec3(x, y, z))
        if (!block || block.name === 'air' || block.name === 'cave_air') continue
        if (!bot.canDigBlock(block)) continue

        const cx = x + 0.5
        const cy = y + 0.5
        const cz = z + 0.5
        const dist = Math.hypot(cx - me.x, cy - me.y, cz - me.z)
        if (dist > MAX_REACH) continue

        seen.add(key)
        const relation = blockRelation(feetY, bx, bz, x, y, z)
        const score = scoreMineable(block.name, relation, dist, digDown, wantWood)
        const id = `mineable:${candidates.length}`
        candidates.push({
          option: { id, x, y, z, block: block.name, relation },
          score,
        })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, MAX_OPTIONS).map((c) => c.option)
}

function blockRelation(
  feetY: number,
  bx: number,
  bz: number,
  x: number,
  y: number,
  z: number
): string {
  const standBlockY = feetY - 1
  if (y < standBlockY) return 'below'
  if (y === standBlockY) return 'underfoot'
  if (x === bx && z === bz && y === feetY) return 'at_body'
  if (y === feetY || y === feetY + 1) return 'adjacent'
  if (y > feetY + 1) return 'above'
  return 'adjacent'
}

function scoreMineable(
  blockName: string,
  relation: string,
  dist: number,
  digDown: boolean,
  wantWood: boolean
): number {
  let score = 100 - dist * 12
  if (relation === 'below' || relation === 'underfoot') score += digDown ? 35 : 10
  if (relation === 'adjacent') score += digDown ? 15 : 5
  if (blockName.endsWith('_log') || blockName.endsWith('_leaves')) score += wantWood ? 30 : -5
  if (
    digDown &&
    (blockName.includes('dirt') ||
      blockName.includes('grass') ||
      blockName === 'stone' ||
      blockName.includes('sand') ||
      blockName.includes('gravel'))
  ) {
    score += 12
  }
  if (blockName.endsWith('_ore') && relation === 'below') score += 8
  return score
}
