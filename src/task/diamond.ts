import type { Percept } from '../body/minecraft/general/index.js'
import type { Task, TaskProgress } from './types.js'

/**
 * Obtain a diamond — the canonical long-horizon Minecraft benchmark. Progress
 * is the highest tech-tree rung reached, detectable purely from inventory.
 * Each rung implies the ones below it, so the score is monotonic.
 *
 * Rungs are checked high→low; the first match is the current milestone.
 */
const LADDER: ReadonlyArray<{ score: number; label: string; has: (inv: Inv) => boolean }> = [
  { score: 11, label: 'diamond', has: (i) => i.any((n) => n === 'diamond') },
  { score: 10, label: 'iron pickaxe', has: (i) => i.any((n) => n === 'iron_pickaxe') },
  { score: 9, label: 'iron ingot', has: (i) => i.any((n) => n === 'iron_ingot') },
  { score: 8, label: 'furnace', has: (i) => i.any((n) => n === 'furnace') },
  { score: 7, label: 'iron ore/raw iron', has: (i) => i.any((n) => n === 'raw_iron' || n === 'iron_ore' || n === 'deepslate_iron_ore') },
  { score: 6, label: 'stone pickaxe', has: (i) => i.any((n) => n === 'stone_pickaxe') },
  { score: 5, label: 'cobblestone', has: (i) => i.any((n) => n === 'cobblestone') },
  { score: 4, label: 'wooden pickaxe', has: (i) => i.any((n) => n === 'wooden_pickaxe') },
  { score: 3, label: 'crafting table', has: (i) => i.any((n) => n === 'crafting_table') },
  { score: 2, label: 'planks', has: (i) => i.any((n) => n.endsWith('_planks')) },
  { score: 1, label: 'logs', has: (i) => i.any((n) => n.endsWith('_log')) },
]

const MAX_SCORE = 11

export const diamondTask: Task = {
  id: 'diamond',
  goal: 'Obtain a diamond.',

  isComplete(percept: Percept): boolean {
    return inv(percept).any((n) => n === 'diamond')
  },

  progress(percept: Percept): TaskProgress {
    const i = inv(percept)
    for (const rung of LADDER) {
      if (rung.has(i)) return { score: rung.score, label: rung.label, max: MAX_SCORE }
    }
    return { score: 0, label: 'start', max: MAX_SCORE }
  },
}

interface Inv {
  any(pred: (name: string) => boolean): boolean
}

function inv(percept: Percept): Inv {
  const names = percept.self.inventory.map((it) => it.name)
  return { any: (pred) => names.some(pred) }
}
