import type { EventLogEntry } from '../../../../brain/types.js'
import type { Motion, Vec3 } from '../../../../body/types.js'

/**
 * Buffers events the mineflayer bot emits between sense() calls. Sensors
 * drain the buffer each tick to populate `new_events` in the RawPercept,
 * which the schedule then appends into the WM's event_log.
 *
 * Events are stamped with the current brain tick at drain time, since
 * perception handlers don't know it.
 */
const RING_SIZE = 50

// Distributive Omit over the union so each event branch keeps its own
// shape (a plain `Omit<EventLogEntry, 'tick'>` collapses to `{ kind }`).
type DraftEvent = EventLogEntry extends infer E
  ? E extends EventLogEntry
    ? Omit<E, 'tick'>
    : never
  : never

export class WorldState {
  private events: DraftEvent[] = []
  private priorPosition: Vec3 | null = null

  pushEvent(event: DraftEvent): void {
    this.events.push(event)
    if (this.events.length > RING_SIZE) {
      this.events.splice(0, this.events.length - RING_SIZE)
    }
  }

  /** Drain and stamp with `tick`. Buffer is cleared. */
  drainEvents(tick: number): EventLogEntry[] {
    const out = this.events.map((e) => ({ ...e, tick }) as EventLogEntry)
    this.events = []
    return out
  }

  /**
   * Compute the bot's motion this tick by comparing position to the prior
   * tick's. Side effect: stores the new position for next tick.
   */
  updateMotion(currentPos: Vec3, onGround: boolean): Motion {
    const prior = this.priorPosition
    this.priorPosition = { x: currentPos.x, y: currentPos.y, z: currentPos.z }
    if (!prior) return onGround ? 'still' : 'falling'
    if (!onGround && Math.abs(currentPos.y - prior.y) < 0.05) {
      // Airborne but not visibly moving vertically yet (e.g. first tick after
      // spawn before physics applied) — call it falling, not still.
      return 'falling'
    }
    const dxz = Math.hypot(currentPos.x - prior.x, currentPos.z - prior.z)
    const dy = currentPos.y - prior.y
    if (!onGround && dy < -0.1) return 'falling'
    if (!onGround && dy > 0.1) return 'rising'
    if (dxz > 0.1) return 'walking'
    return 'still'
  }
}
