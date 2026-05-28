import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '../logger.js'
import type {
  EventLogEntry,
  RawPercept,
  WorkingMemory,
  WorkingMemorySelf,
} from './types.js'
import type { DriveState } from './types.js'

const EVENT_LOG_MAX = 50
const RECENT_EVENT_DEFAULT = 10

/**
 * Atticus's working memory — persistent, lives across ticks. Writers are
 * single-purpose so the data-flow stays auditable. Each writer persists to
 * disk if a `persistPath` was provided.
 *
 * Focus is NOT stored here — it's transient, produced by the Thalamus this
 * tick and consumed by the PFC the same tick.
 */
export class Workspace {
  private wm: WorkingMemory
  private persistPath: string | null

  constructor(wm: WorkingMemory, persistPath: string | null = null) {
    this.wm = wm
    this.persistPath = persistPath
  }

  /** Build a fresh in-memory Workspace (no disk persistence). */
  static init(identity: string, initialSelf: WorkingMemorySelf): Workspace {
    return new Workspace(freshWm(identity, initialSelf), null)
  }

  /**
   * Load WM from disk if a file exists at `persistPath`, otherwise build a
   * fresh one. Tolerant of old WM file shapes from v0.3 (extra `salient` /
   * `recent_thoughts` fields are ignored; missing `event_log` defaults to []).
   */
  static loadOrInit(
    persistPath: string,
    identity: string,
    initialSelf: WorkingMemorySelf
  ): Workspace {
    if (existsSync(persistPath)) {
      try {
        const data = JSON.parse(readFileSync(persistPath, 'utf8')) as Partial<WorkingMemory> & {
          recent_thoughts?: unknown
          salient?: unknown
        }
        const wm: WorkingMemory = {
          identity, // always overwrite from code constant
          self: (data.self as WorkingMemorySelf | undefined) ?? initialSelf,
          intention: data.intention ?? '',
          event_log: (data.event_log as EventLogEntry[] | undefined) ?? [],
          tick: data.tick ?? 0,
          timestamp: data.timestamp ?? Date.now(),
          ...(data.drive_state ? { drive_state: data.drive_state as DriveState } : {}),
        }
        logger.info(
          { persistPath, tick: wm.tick, events: wm.event_log.length },
          'restored working memory from disk'
        )
        return new Workspace(wm, persistPath)
      } catch (err) {
        logger.warn(
          { persistPath, err: String(err) },
          'failed to load WM — starting fresh'
        )
      }
    }
    return new Workspace(freshWm(identity, initialSelf), persistPath)
  }

  /** The tick of the most recent updateSelfAndTick call (0 if never patched). */
  get lastTick(): number {
    return this.wm.tick
  }

  // --- Writers ---

  /** Schedule writes self + tick from the body's percept each loop. */
  updateSelfAndTick(self: WorkingMemorySelf, tick: number): void {
    this.wm.self = self
    this.wm.tick = tick
    this.wm.timestamp = Date.now()
    this.persist()
  }

  /** Append an event to the log, trimming to EVENT_LOG_MAX. */
  appendEvent(event: EventLogEntry): void {
    this.wm.event_log.push(event)
    if (this.wm.event_log.length > EVENT_LOG_MAX) {
      this.wm.event_log.splice(0, this.wm.event_log.length - EVENT_LOG_MAX)
    }
    this.persist()
  }

  /** PFC sets the new intention each tick. */
  setIntention(intention: string): void {
    this.wm.intention = intention
    this.persist()
  }

  getDriveState(): DriveState | null {
    return this.wm.drive_state ?? null
  }

  setDriveState(state: DriveState): void {
    this.wm.drive_state = state
    this.persist()
  }

  // --- Readers ---

  /**
   * The slice the Thalamus reads — identity + intention + recent events.
   * Defaults to the last 10 events; pass `n` to override.
   */
  sliceForThalamus(n: number = RECENT_EVENT_DEFAULT): {
    identity: string
    intention: string
    recent_events: readonly EventLogEntry[]
  } {
    return {
      identity: this.wm.identity,
      intention: this.wm.intention,
      recent_events: this.wm.event_log.slice(-n),
    }
  }

  /** The full event log, for hydration of `events` refs. */
  get eventLog(): readonly EventLogEntry[] {
    return this.wm.event_log
  }

  /** Full read — for logging and tests. Avoid using from brain modules. */
  raw(): Readonly<WorkingMemory> {
    return this.wm
  }

  private persist(): void {
    if (!this.persistPath) return
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true })
      writeFileSync(this.persistPath, JSON.stringify(this.wm, null, 2))
    } catch (err) {
      logger.warn(
        { persistPath: this.persistPath, err: String(err) },
        'failed to persist WM — continuing'
      )
    }
  }
}

function freshWm(identity: string, initialSelf: WorkingMemorySelf): WorkingMemory {
  return {
    identity,
    self: initialSelf,
    intention: '',
    event_log: [],
    tick: 0,
    timestamp: Date.now(),
  }
}

/**
 * Derive the WorkingMemory `self` slot from a fresh RawPercept. Strict subset
 * of RawPercept.self (no inventory, no held_item — those are sense-time-only).
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
    motion: p.self.motion,
  }
}
