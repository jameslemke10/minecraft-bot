import type { Vec3 } from '../../types.js'
import type { DraftWorldEvent, Motion, WorldEvent } from './percept.js'

const RING_SIZE = 50

/**
 * Buffers world events the bot emits between sense() calls, and computes
 * motion from the prior tick's position. Drained each tick into the percept.
 */
export class WorldState {
  private events: DraftWorldEvent[] = []
  private priorPosition: Vec3 | null = null

  pushEvent(event: DraftWorldEvent): void {
    this.events.push(event)
    if (this.events.length > RING_SIZE) {
      this.events.splice(0, this.events.length - RING_SIZE)
    }
  }

  /** Drain and stamp with `tick`. Buffer is cleared. */
  drainEvents(tick: number): WorldEvent[] {
    const out = this.events.map((e) => ({ ...e, tick }) as WorldEvent)
    this.events = []
    return out
  }

  /** Motion this tick vs last; side effect: stores current position. */
  updateMotion(currentPos: Vec3, onGround: boolean): Motion {
    const prior = this.priorPosition
    this.priorPosition = { x: currentPos.x, y: currentPos.y, z: currentPos.z }
    if (!prior) return onGround ? 'still' : 'falling'
    if (!onGround && Math.abs(currentPos.y - prior.y) < 0.05) return 'falling'
    const dxz = Math.hypot(currentPos.x - prior.x, currentPos.z - prior.z)
    const dy = currentPos.y - prior.y
    if (!onGround && dy < -0.1) return 'falling'
    if (!onGround && dy > 0.1) return 'rising'
    if (dxz > 0.1) return 'walking'
    return 'still'
  }
}
