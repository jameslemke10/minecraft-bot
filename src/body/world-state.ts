import type { InventoryItem, NearbyEntity, Vec3, WorldSnapshot } from '../brain/types.js'

const EVENT_RING_SIZE = 20

export class WorldState {
  tick = 0
  position: Vec3 = { x: 0, y: 0, z: 0 }
  yaw = 0
  pitch = 0
  health = 20
  food = 20
  inventory: InventoryItem[] = []
  nearbyEntities: NearbyEntity[] = []
  goal = 'explore'

  private events: string[] = []

  pushEvent(msg: string): void {
    this.events.push(msg)
    if (this.events.length > EVENT_RING_SIZE) {
      this.events.splice(0, this.events.length - EVENT_RING_SIZE)
    }
  }

  /**
   * Return a deep-frozen snapshot. The brain reads only this — never the mutable state.
   */
  snapshot(): WorldSnapshot {
    const snap: WorldSnapshot = {
      tick: this.tick,
      timestamp: Date.now(),
      position: { ...this.position },
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      food: this.food,
      inventory: this.inventory.map((i) => ({ ...i })),
      nearbyEntities: this.nearbyEntities.map((e) => ({
        ...e,
        position: { ...e.position },
      })),
      recentEvents: [...this.events],
      goal: this.goal,
    }
    return deepFreeze(snap)
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  for (const key of Object.keys(obj as object)) {
    deepFreeze((obj as Record<string, unknown>)[key])
  }
  return Object.freeze(obj)
}
