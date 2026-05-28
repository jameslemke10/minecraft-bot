import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve `src/agents/<agent>/data/` from that agent's index module URL. */
export function agentDataDir(importMetaUrl: string): string {
  return join(dirname(fileURLToPath(importMetaUrl)), 'data')
}

export function agentWmPath(importMetaUrl: string): string {
  return join(agentDataDir(importMetaUrl), 'wm.json')
}
