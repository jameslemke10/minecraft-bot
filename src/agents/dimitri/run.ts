/**
 * Run Dimitri (continuous context-management arm) on the diamond task.
 * Run: pnpm dimitri        (unbounded — Ctrl+C to stop)
 *      MAX_TICKS=20 pnpm dimitri   (bounded smoke test)
 */
import { logger } from '../../logger.js'
import { config } from '../../config.js'
import { createMetrics } from '../../llm/metrics.js'
import { RunLog } from '../run-log.js'
import { ObserverDashboard } from '../../observer/dashboard.js'
import { createGeneralBody } from '../../body/minecraft/general/index.js'
import { diamondTask } from '../../task/diamond.js'
import { WorkingMemory } from './wm.js'
import { runDimitri } from './loop.js'

const DATA_DIR = 'src/agents/dimitri/data'
const WM_PATH = `${DATA_DIR}/wm.json`
const VIEWER_THIRD = 3020
const VIEWER_FIRST = 3021
const OBSERVER_PORT = Number.parseInt(process.env.OBSERVER_PORT ?? '3022', 10)

async function main(): Promise<void> {
  const metrics = createMetrics('dimitri')
  const runLog = new RunLog('dimitri', DATA_DIR)
  const task = diamondTask
  const maxTicks = process.env.MAX_TICKS ? Number.parseInt(process.env.MAX_TICKS, 10) : undefined

  const body = await createGeneralBody({
    username: process.env.DIMITRI_NAME ?? 'Dimitri',
    viewer: { enabled: config.viewer.enabled, thirdPersonPort: VIEWER_THIRD, firstPersonPort: VIEWER_FIRST },
  })

  const wm = WorkingMemory.loadOrInit(task.goal, WM_PATH)

  const observer =
    config.observer.enabled && !Number.isNaN(OBSERVER_PORT)
      ? new ObserverDashboard({
          agentId: 'dimitri',
          port: OBSERVER_PORT,
          runDir: runLog.runDir,
          viewer: {
            thirdPerson: `http://localhost:${VIEWER_THIRD}`,
            firstPerson: `http://localhost:${VIEWER_FIRST}`,
          },
        })
      : undefined
  await observer?.start()
  if (observer?.url) {
    process.stderr.write(
      '\n' +
        '═══════════════════════════════════════════════════════\n' +
        '  WATCH DIMITRI (HUD):     http://localhost:3022\n' +
        '  3D view (new tab):       http://localhost:3020\n' +
        '  terminal watch:          pnpm dimitri:watch\n' +
        '═══════════════════════════════════════════════════════\n\n'
    )
  }

  const controller = new AbortController()
  let shuttingDown = false
  const shutdown = (sig: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ sig }, 'shutting down Dimitri')
    controller.abort()
    observer?.close()
    runLog.finalize(metrics)
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  logger.info(
    {
      goal: task.goal,
      maxTicks,
      runDir: runLog.runDir,
      observer: observer?.url,
      viewerThird: config.viewer.enabled ? `http://localhost:${VIEWER_THIRD}` : undefined,
      viewerFirst: config.viewer.enabled ? `http://localhost:${VIEWER_FIRST}` : undefined,
    },
    'starting Dimitri'
  )

  await runDimitri(body, wm, {
    task,
    metrics,
    runLog,
    ...(observer ? { observer } : {}),
    ...(maxTicks !== undefined && !Number.isNaN(maxTicks) ? { maxTicks } : {}),
    signal: controller.signal,
  })

  if (!shuttingDown) {
    observer?.close()
    runLog.finalize(metrics)
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'Dimitri fatal error')
  process.exit(1)
})
