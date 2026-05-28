import type { Bot } from 'mineflayer'
import type { RawPercept } from '../../types.js'
import type { WorldState } from '../world-state.js'
import { senseSelf } from './self.js'
import { senseEntities } from './entities.js'
import { senseTerrain } from './terrain.js'
import { senseScene } from './scene.js'

/**
 * Compose the individual sensors into one RawPercept. This is what
 * body.sense() returns each tick.
 */
export function buildRawPercept(bot: Bot, world: WorldState, tick: number): RawPercept {
  const entities = senseEntities(bot)
  const pos = bot.entity?.position
  const motion = pos
    ? world.updateMotion({ x: pos.x, y: pos.y, z: pos.z }, bot.entity.onGround)
    : 'still'
  return {
    self: senseSelf(bot, motion),
    terrain: senseTerrain(bot),
    scene: senseScene(bot, entities),
    nearby_entities: entities,
    new_events: world.drainEvents(tick),
    tick,
    timestamp: Date.now(),
  }
}
