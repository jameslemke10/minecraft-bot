import type {
  RawPercept,
  SalientItem,
  Thought,
  WorkingMemory,
  WorkingMemorySelf,
} from './types.js'

const RECENT_THOUGHTS_MAX = 5

/**
 * The shared workspace — Atticus's working memory.
 *
 * Mutable in implementation, but only ever patched through these methods so
 * the data-flow stays auditable. Modules read slices via the `sliceFor*`
 * helpers, which keeps context-window cost per module explicit.
 */
export class Workspace {
  private wm: WorkingMemory

  constructor(identity: string, initialSelf: WorkingMemorySelf) {
    this.wm = {
      identity,
      self: initialSelf,
      salient: [],
      recent_thoughts: [],
      intention: '',
      tick: 0,
      timestamp: Date.now(),
    }
  }

  // --- Writers (one per module's permitted slot) ---

  /** Attention writes self + salient + tick. */
  patchFromAttention(args: {
    self: WorkingMemorySelf
    salient: SalientItem[]
    tick: number
  }): void {
    this.wm.self = args.self
    this.wm.salient = args.salient
    this.wm.tick = args.tick
    this.wm.timestamp = Date.now()
  }

  /** Executive appends a thought and updates intention. */
  patchFromExecutive(args: { thought: Thought; intention: string }): void {
    this.wm.recent_thoughts.push(args.thought)
    if (this.wm.recent_thoughts.length > RECENT_THOUGHTS_MAX) {
      this.wm.recent_thoughts.splice(
        0,
        this.wm.recent_thoughts.length - RECENT_THOUGHTS_MAX
      )
    }
    this.wm.intention = args.intention
  }

  // --- Readers (slices, not the whole thing) ---

  /** Slice Attention reads: identity + intention + recent thoughts. */
  sliceForAttention(): {
    identity: string
    intention: string
    recent_thoughts: readonly Thought[]
  } {
    return {
      identity: this.wm.identity,
      intention: this.wm.intention,
      recent_thoughts: this.wm.recent_thoughts,
    }
  }

  /** Slice Executive reads: identity + self + salient + intention + thoughts. */
  sliceForExecutive(): {
    identity: string
    self: WorkingMemorySelf
    salient: readonly SalientItem[]
    intention: string
    recent_thoughts: readonly Thought[]
  } {
    return {
      identity: this.wm.identity,
      self: this.wm.self,
      salient: this.wm.salient,
      intention: this.wm.intention,
      recent_thoughts: this.wm.recent_thoughts,
    }
  }

  /** Full read — for logging and tests. Avoid using from brain modules. */
  raw(): Readonly<WorkingMemory> {
    return this.wm
  }
}

/**
 * Derive the WorkingMemory `self` slot from a fresh RawPercept. The shape
 * is a strict subset of RawPercept.self (no inventory, no held_item — those
 * are sense-time-only).
 */
export function selfFromPercept(p: RawPercept): WorkingMemorySelf {
  return {
    position: p.self.position,
    yaw: p.self.yaw,
    pitch: p.self.pitch,
    health: p.self.health,
    food: p.self.food,
    on_ground: p.self.on_ground,
    in_water: p.self.in_water,
  }
}
