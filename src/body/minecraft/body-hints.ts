import type { Bot } from 'mineflayer'
import type { BodyHints, BodyHintsContext } from '../types.js'
import { describeCraftablePart } from './craft-hints.js'
import { describeMineable } from './mine-hints.js'

/** Live body affordances for the brain — craft + mine targets this tick. */
export function describeBodyHints(bot: Bot, ctx: BodyHintsContext = {}): BodyHints {
  const craft = describeCraftablePart(bot)
  const mineable = describeMineable(bot, ctx.intention ?? '')
  return {
    ...craft,
    mineable,
  }
}
