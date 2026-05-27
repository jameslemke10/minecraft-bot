import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import type { Movements } from 'mineflayer-pathfinder'
import { ActionSchema, type Action } from '../../brain/types.js'
import { logger } from '../../logger.js'

const { goals } = pathfinderPkg

const MOVE_TIMEOUT_MS = 30_000

export interface ExecuteDeps {
  bot: Bot
  movements: Movements
}

/**
 * Validate an action and dispatch it to mineflayer. Resolves when the action
 * is complete (or has timed out / been rejected). The brain awaits this so
 * the loop is action-driven in v1.
 */
export async function execute(deps: ExecuteDeps, raw: unknown): Promise<void> {
  const parsed = ActionSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ raw, issues: parsed.error.issues }, 'rejected malformed action')
    return
  }
  const action = parsed.data
  logger.info({ action }, 'executing action')

  switch (action.kind) {
    case 'move':
      await doMove(deps, action)
      return
    case 'chat':
      deps.bot.chat(action.args.msg)
      return
    case 'wait':
      await sleep(action.args.ms)
      return
  }
}

async function doMove(
  { bot, movements }: ExecuteDeps,
  action: Extract<Action, { kind: 'move' }>
): Promise<void> {
  const { x, z } = action.args
  bot.pathfinder.setMovements(movements)
  const goal = new goals.GoalNearXZ(x, z, 1)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ x, z }, 'move timed out')
      bot.pathfinder.stop()
      resolve()
    }, MOVE_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      bot.pathfinder.goto(goal).catch((err: unknown) => {
        logger.warn({ err: String(err) }, 'pathfinder.goto failed')
      }),
      timeoutPromise,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
