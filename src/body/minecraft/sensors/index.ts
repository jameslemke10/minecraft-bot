import type { Bot } from 'mineflayer'
import type { RawPercept } from '../../types.js'
import type { WorldState } from '../world-state.js'
import { senseSelf } from './self.js'
import { senseEntities } from './entities.js'
import { senseTerrain, senseNearbyBlocks } from './terrain.js'

/**
 * Compose the individual sensors into one RawPercept. This is what
 * body.sense() returns each tick.
 */
export function buildRawPercept(bot: Bot, world: WorldState, tick: number): RawPercept {
  return {
    self: senseSelf(bot),
    terrain: senseTerrain(bot),
    nearby_blocks: senseNearbyBlocks(bot),
    nearby_entities: senseEntities(bot),
    recent_events: [...world.getEvents()],
    tick,
    timestamp: Date.now(),
  }
}
