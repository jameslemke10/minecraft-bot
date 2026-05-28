import type { Bot } from 'mineflayer'
import { Vec3 as MFVec3 } from 'vec3'
import type { Vec3 } from '../types.js'

export interface ClusterReachMeta {
  /** At least one block in the cluster passes bot.canDigBlock from here. */
  exposed: boolean
  /** Blocks between feet and anchor (positive = anchor is underground). */
  depth_below_feet: number
  /** First diggable block in the cluster, if exposed. */
  mineable_at?: Vec3
}

/** Reachability metadata for clustered scene objects (ore, trees, etc.). */
export function clusterReachabilityMeta(
  bot: Bot,
  cluster: readonly Vec3[],
  anchor: Vec3,
  feetY: number
): ClusterReachMeta {
  let mineable_at: Vec3 | undefined
  for (const p of cluster) {
    const block = bot.blockAt(new MFVec3(p.x, p.y, p.z))
    if (block && bot.canDigBlock(block)) {
      mineable_at = { x: p.x, y: p.y, z: p.z }
      break
    }
  }
  return {
    exposed: mineable_at !== undefined,
    depth_below_feet: feetY - anchor.y,
    ...(mineable_at ? { mineable_at } : {}),
  }
}
