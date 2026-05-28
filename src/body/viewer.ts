import { createServer } from 'node:net'
import type { Bot } from 'mineflayer'
import prismarineViewerPkg from 'prismarine-viewer'
import { logger } from '../logger.js'

const { mineflayer: mineflayerViewer } = prismarineViewerPkg

type BotWithViewers = Bot & { _viewerCloses?: (() => void)[] }

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port)
  })
}

/**
 * Start prismarine-viewer if the port is free.
 *
 * Each call creates a separate HTTP server. prismarine-viewer overwrites
 * `bot.viewer` every time, so we stash each `close` callback ourselves —
 * otherwise only the last viewer port is released on shutdown.
 */
export async function startViewerSafe(
  bot: Bot,
  port: number,
  firstPerson: boolean
): Promise<void> {
  if (!(await isPortFree(port))) {
    logger.warn(
      { port, view: firstPerson ? 'first-person' : 'third-person' },
      'viewer port already in use — skipping (kill stale node process or use VIEWER_ENABLED=false)'
    )
    return
  }

  mineflayerViewer(bot, { port, firstPerson })

  const close = (bot as Bot & { viewer?: { close?: () => void } }).viewer?.close
  if (close) {
    const b = bot as BotWithViewers
    b._viewerCloses ??= []
    b._viewerCloses.push(close)
  }

  logger.info(
    { url: `http://localhost:${port}`, view: firstPerson ? 'first-person' : 'third-person' },
    'viewer started'
  )
}

/** Close every viewer HTTP server started for this bot. */
export function closeAllViewers(bot: Bot): void {
  const b = bot as BotWithViewers
  for (const close of b._viewerCloses ?? []) {
    try {
      close()
    } catch (err) {
      logger.warn({ err: String(err) }, 'viewer close failed')
    }
  }
  b._viewerCloses = []
}

/**
 * Tear down bot connection: viewers, pathfinder, then quit.
 * Called on Ctrl+C and process exit so ports don't leak.
 */
export function disconnectBot(bot: Bot): void {
  closeAllViewers(bot)
  try {
    bot.pathfinder?.stop()
  } catch {
    /* pathfinder may not be loaded */
  }
  try {
    bot.stopDigging()
  } catch {
    /* not digging */
  }
  try {
    bot.clearControlStates()
  } catch {
    /* ok */
  }
  try {
    if (bot.entity) bot.quit('disconnecting')
  } catch (err) {
    logger.warn({ err: String(err) }, 'bot.quit failed — forcing end')
    try {
      bot.end()
    } catch {
      /* best effort */
    }
  }
}
