import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '../../logger.js'
import type { Action } from '../../body/minecraft/general/index.js'

/**
 * Dimitri's working memory — ONE JSON document holding everything that
 * accumulates during a run. The curator chooses what to pass to the executive
 * and what to GC; only the executive authors content; only the curator removes.
 *
 * - goal:    constant. Gate-able from a tick's context, but NEVER removable.
 * - history: unified timeline (thoughts/actions/outcomes/events). Removable.
 * - notes:   executive-authored durable scratch. Removable.
 *
 * The live percept is NOT stored here — it's transient, re-sensed each tick.
 */

export type HistoryEntry =
  | { id: string; tick: number; kind: 'thought'; text: string; intention?: string }
  | { id: string; tick: number; kind: 'action'; action: Action }
  | { id: string; tick: number; kind: 'outcome'; actionKind: string; ok: boolean; message: string }
  | { id: string; tick: number; kind: 'event'; text: string }

export interface Note {
  id: string
  tick: number
  text: string
}

interface WmDoc {
  goal: string
  history: HistoryEntry[]
  notes: Note[]
  historySeq: number
  noteSeq: number
}

export class WorkingMemory {
  private doc: WmDoc
  private persistPath: string | null

  constructor(doc: WmDoc, persistPath: string | null) {
    this.doc = doc
    this.persistPath = persistPath
  }

  static loadOrInit(goal: string, persistPath: string | null): WorkingMemory {
    if (persistPath && existsSync(persistPath)) {
      try {
        const raw = JSON.parse(readFileSync(persistPath, 'utf8')) as Partial<WmDoc>
        const doc: WmDoc = {
          goal, // always from code
          history: raw.history ?? [],
          notes: raw.notes ?? [],
          historySeq: raw.historySeq ?? (raw.history?.length ?? 0),
          noteSeq: raw.noteSeq ?? (raw.notes?.length ?? 0),
        }
        logger.info(
          { persistPath, history: doc.history.length, notes: doc.notes.length },
          'restored Dimitri WM'
        )
        return new WorkingMemory(doc, persistPath)
      } catch (err) {
        logger.warn({ persistPath, err: String(err) }, 'failed to load Dimitri WM — fresh')
      }
    }
    return new WorkingMemory(
      { goal, history: [], notes: [], historySeq: 0, noteSeq: 0 },
      persistPath
    )
  }

  get goal(): string {
    return this.doc.goal
  }
  get history(): readonly HistoryEntry[] {
    return this.doc.history
  }
  get notes(): readonly Note[] {
    return this.doc.notes
  }

  // --- writers (executive + harness add; curator removes) ---

  addEvent(tick: number, text: string): string {
    const id = this.nextHistoryId()
    this.doc.history.push({ id, tick, kind: 'event', text })
    return id
  }

  addThought(tick: number, text: string, intention?: string): string {
    const id = this.nextHistoryId()
    this.doc.history.push({ id, tick, kind: 'thought', text, ...(intention ? { intention } : {}) })
    return id
  }

  addAction(tick: number, action: Action): string {
    const id = this.nextHistoryId()
    this.doc.history.push({ id, tick, kind: 'action', action })
    return id
  }

  addOutcome(tick: number, actionKind: string, ok: boolean, message: string): string {
    const id = this.nextHistoryId()
    this.doc.history.push({ id, tick, kind: 'outcome', actionKind, ok, message })
    return id
  }

  addNote(tick: number, text: string): string {
    const id = this.nextNoteId()
    this.doc.notes.push({ id, tick, text })
    return id
  }

  /** Curator GC. Removes history/notes by id. The goal can never be removed. */
  remove(ids: readonly string[]): { removed: number } {
    const set = new Set(ids)
    const beforeH = this.doc.history.length
    const beforeN = this.doc.notes.length
    this.doc.history = this.doc.history.filter((e) => !set.has(e.id))
    this.doc.notes = this.doc.notes.filter((n) => !set.has(n.id))
    return { removed: beforeH - this.doc.history.length + (beforeN - this.doc.notes.length) }
  }

  findById(id: string): HistoryEntry | Note | null {
    return (
      this.doc.history.find((e) => e.id === id) ??
      this.doc.notes.find((n) => n.id === id) ??
      null
    )
  }

  /** Most recent N history entries — used by the trap detector / protected window. */
  recentHistory(n: number): readonly HistoryEntry[] {
    return this.doc.history.slice(-n)
  }

  persist(): void {
    if (!this.persistPath) return
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true })
      writeFileSync(this.persistPath, JSON.stringify(this.doc, null, 2))
    } catch (err) {
      logger.warn({ persistPath: this.persistPath, err: String(err) }, 'failed to persist Dimitri WM')
    }
  }

  private nextHistoryId(): string {
    this.doc.historySeq += 1
    return `h${this.doc.historySeq}`
  }
  private nextNoteId(): string {
    this.doc.noteSeq += 1
    return `n${this.doc.noteSeq}`
  }
}
