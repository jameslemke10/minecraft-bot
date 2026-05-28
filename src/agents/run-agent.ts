import type { AgentDefinition } from './types.js'
import { logger } from '../logger.js'
import { createMetrics, type Metrics } from '../llm/metrics.js'
import { Workspace, selfFromPercept } from '../brain/workspace.js'
import type { Body } from '../body/types.js'
import type { Action } from '../brain/types.js'
import { RunLog } from './run-log.js'

export interface RunningAgent {
  def: AgentDefinition
  body: Body<Action>
  workspace: Workspace
  metrics: Metrics
  runLog: RunLog
}

/** Connect one agent's body and load its working memory. */
export async function bootAgent(def: AgentDefinition): Promise<RunningAgent> {
  const metrics = createMetrics(def.id)
  const runLog = new RunLog(def.id, def.dataDir)
  logger.info(
    {
      agent: def.id,
      mcUsername: def.mcUsername,
      dataDir: def.dataDir,
      wmPath: def.wmPath,
      runDir: runLog.runDir,
      brainSchedule: def.brainSchedule,
      viewer: def.viewer,
    },
    'booting agent'
  )

  const body = await def.createBody()
  const initial = await body.sense()
  const workspace = Workspace.loadOrInit(
    def.wmPath,
    def.identity,
    selfFromPercept(initial)
  )

  return { def, body, workspace, metrics, runLog }
}

/** Run the conscious loop for one agent until the shared abort signal fires. */
export async function runAgentLoop(
  running: RunningAgent,
  signal: AbortSignal
): Promise<void> {
  const { def, body, workspace, metrics, runLog } = running

  const maxTicks = process.env.MAX_TICKS
    ? Number.parseInt(process.env.MAX_TICKS, 10)
    : undefined

  const loop = def.runBrain(body, workspace, {
    agentId: def.id,
    displayName: def.displayName,
    identity: def.identity,
    metrics,
    runLog,
    ...(maxTicks !== undefined && !Number.isNaN(maxTicks) ? { maxTicks } : {}),
  })

  const onAbort = (): void => {
    body.disconnect()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    await loop
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function shutdownAgent(running: RunningAgent): void {
  running.runLog.finalize(running.metrics)
  running.body.disconnect()
}
