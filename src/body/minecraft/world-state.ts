/**
 * The mineflayer bot already holds the live world state (position, vitals,
 * inventory, entities) — there's no point duplicating it. WorldState's only
 * job now is to buffer recent *events* (block broken, player joined, took
 * damage, etc.) since mineflayer doesn't keep history. Sensors read these
 * via getEvents().
 */
const RING_SIZE = 20

export class WorldState {
  private events: string[] = []

  pushEvent(msg: string): void {
    this.events.push(msg)
    if (this.events.length > RING_SIZE) {
      this.events.splice(0, this.events.length - RING_SIZE)
    }
  }

  getEvents(): readonly string[] {
    return this.events
  }
}
