import { createMinecraftBody } from './body/minecraft/index.js'
import { logger } from './logger.js'
import { ATTICUS_IDENTITY } from './brain/identity.js'
import { Workspace, selfFromPercept } from './brain/workspace.js'
import { runBrain } from './brain/schedule.js'
import { metrics } from './llm/metrics.js'

// Co-located with the Minecraft world: `pnpm server:reset` wipes both, so a
// fresh world also means a fresh mind.
const WM_PATH = 'server/data/atticus-wm.json'

async function main(): Promise<void> {
  const body = await createMinecraftBody()

  // Initialize working memory from a first sense() so `self` is real (only
  // used if there's no prior WM on disk).
  const initial = await body.sense()
  const workspace = Workspace.loadOrInit(
    WM_PATH,
    ATTICUS_IDENTITY,
    selfFromPercept(initial)
  )

  const shutdown = (signal: string): void => {
    // Print the summary synchronously the instant the signal arrives, before
    // any async work — so it survives a force-kill (e.g. `tsx watch` killing
    // the child on Ctrl+C) that would otherwise cut off the async logger.
    metrics.printSummaryOnce()
    logger.info({ signal }, 'shutting down')
    body.disconnect()
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGHUP', () => shutdown('SIGHUP'))
  // Backup: also print on normal exit (no-op if a signal already printed it).
  process.on('exit', () => metrics.printSummaryOnce())

  await runBrain(body, workspace)
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'fatal error')
  process.exit(1)
})
