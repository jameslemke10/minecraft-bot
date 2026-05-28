import { atticus } from './atticus/index.js'
import { brutus } from './brutus/index.js'
import type { AgentDefinition } from './types.js'

/** All registered agents, alphabet line. Add Charlie here — never merge backward. */
export const AGENTS: Record<string, AgentDefinition> = {
  [atticus.id]: atticus,
  [brutus.id]: brutus,
}

export const AGENT_IDS = Object.keys(AGENTS) as (keyof typeof AGENTS)[]

export function getAgent(id: string): AgentDefinition {
  const agent = AGENTS[id.toLowerCase()]
  if (!agent) {
    throw new Error(
      `Unknown agent "${id}". Available: ${AGENT_IDS.join(', ')}`
    )
  }
  return agent
}

/**
 * Resolve which agents to spawn from CLI args and/or AGENTS env.
 * CLI: `pnpm dev -- atticus brutus`
 * Env: `AGENTS=atticus,brutus`
 * Default: atticus only (backward compatible).
 */
export function resolveAgentIds(argv: string[]): string[] {
  const cli = argv.filter((a) => !a.startsWith('-'))
  if (cli.length > 0) return cli.map((id) => id.toLowerCase())

  const env = process.env.AGENTS?.trim()
  if (env) {
    return env
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }

  return ['atticus']
}

export function resolveAgents(argv: string[]): AgentDefinition[] {
  const ids = resolveAgentIds(argv)
  const seen = new Set<string>()
  const out: AgentDefinition[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(getAgent(id))
  }
  return out
}
