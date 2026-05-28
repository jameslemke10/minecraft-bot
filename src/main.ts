import { logger } from './logger.js'
import { resolveAgents } from './agents/registry.js'
import { bootAgent, runAgentLoop, shutdownAgent } from './agents/run-agent.js'

async function main(): Promise<void> {
  const agents = resolveAgents(process.argv.slice(2))
  logger.info(
    { agents: agents.map((a) => a.id) },
    'spawning agents'
  )

  const controller = new AbortController()
  const running = await Promise.all(agents.map((def) => bootAgent(def)))

  const shutdown = (signal: string): void => {
    logger.info({ signal, agents: running.map((r) => r.def.id) }, 'shutting down')
    controller.abort()
    for (const r of running) shutdownAgent(r)
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGHUP', () => shutdown('SIGHUP'))
  process.on('exit', () => {
    for (const r of running) r.metrics.printSummaryOnce()
  })

  await Promise.all(running.map((r) => runAgentLoop(r, controller.signal)))
}

main().catch((err: unknown) => {
  logger.fatal({ err: String(err) }, 'fatal error')
  process.exit(1)
})
