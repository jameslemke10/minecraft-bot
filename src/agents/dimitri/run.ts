/**
 * Run Dimitri (continuous context-management arm) on the diamond task.
 * Run: pnpm dimitri        (unbounded — Ctrl+C to stop)
 *      MAX_TICKS=20 pnpm dimitri   (bounded smoke test)
 */
import { logger } from '../../logger.js'
import { config } from '../../config.js'
import { createMetrics } from '../../llm/metrics.js'
import { RunLog } from '../run-log.js'
import { createGeneralBody } from '../../body/minecraft/general/index.js'
import { diamondTask } from '../../task/diamond.js'
import { WorkingMemory } from './wm.js'
import { runDimitri } from './loop.js'

const DATA_DIR = 'src/agents/dimitri/data'
const WM_PATH = `${DATA_DIR}/wm.json`

async function main(): Promise<void> {
  const metrics = createMetrics('dimitri')
  const runLog = new RunLog('dimitri', DATA_DIR)
  const task = diamondTask
  const maxTicks = process.env.MAX_TICKS ? Number.parseInt(process.env.MAX_TICKS, 10) : undefined

  const body = await createGeneralBody({
    username: process.env.DIMITRI_NAME ?? 'Dimitri',
    viewer: { enabled: config.viewer.enabled, thirdPersonPort: 3020, firstPersonPort: 3021 },
  })

  const wm = WorkingMemory.loadOrInit(task.goal, WM_PATH)

  const controller = new AbortController()
  let shuttingDown = false
  const shutdown = (sig: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ sig }, 'shutting down Dimitri')
    controller.abort()
    runLog.finalize(metrics)
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  logger.info({ goal: task.goal, maxTicks, runDir: runLog.runDir }, 'starting Dimitri')

  await runDimitri(body, wm, {
    task,
    metrics,
    runLog,
    ...(maxTicks !== undefined && !Number.isNaN(maxTicks) ? { maxTicks } : {}),
    signal: controller.signal,
  })

  if (!shuttingDown) {
    runLog.finalize(metrics)
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'Dimitri fatal error')
  process.exit(1)
})
