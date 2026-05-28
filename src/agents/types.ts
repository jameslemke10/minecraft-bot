import type { Body } from '../body/types.js'
import type { Action } from '../brain/types.js'
import type { Workspace } from '../brain/workspace.js'
import type { BrainLoopOptions } from '../brain/schedule.js'

/** Per-agent viewer ports — each agent needs its own pair when running together. */
export interface AgentViewerConfig {
  thirdPersonPort: number
  firstPersonPort: number
}

/** Connection options passed into an agent's body factory. */
export interface MinecraftBodyOptions {
  username: string
  viewer: AgentViewerConfig & { enabled: boolean }
}

export type BrainSchedule = 'baseline' | 'drives'

/**
 * One agent in the alphabet line (Atticus, Brutus, Charlie, …).
 * Each agent owns identity, body, data/, and schedule variant.
 * Agents never merge — new letters fork from the latest, not backward.
 */
export interface AgentDefinition {
  id: string
  displayName: string
  mcUsername: string
  /** Directory for persistent agent state (WM, future episodic memory, …). */
  dataDir: string
  wmPath: string
  viewer: AgentViewerConfig
  identity: string
  brainSchedule: BrainSchedule
  createBody: () => Promise<Body<Action>>
  runBrain: (
    body: Body<Action>,
    workspace: Workspace,
    opts: BrainLoopOptions
  ) => Promise<void>
}
