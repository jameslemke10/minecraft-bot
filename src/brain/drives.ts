import type {
  Action,
  DriveState,
  DrivesOutput,
  DriveSignals,
  EventLogEntry,
  FocusItem,
  WorkingMemorySelf,
} from './types.js'

export const EMPTY_DRIVE_STATE: DriveState = {
  focus_streak: null,
  habituation: {},
  last_action: null,
  last_position: null,
  intention_streak: 0,
  last_intention: '',
  wait_streak: 0,
}

export interface DrivesInput {
  self: WorkingMemorySelf
  focus: readonly FocusItem[]
  intention: string
  recent_events: readonly EventLogEntry[]
  prev: DriveState | null
  tick: number
}

/** Input for the parallel (pre-focus) drive pass — no focus yet. */
export interface DrivesBaseInput {
  self: WorkingMemorySelf
  intention: string
  recent_events: readonly EventLogEntry[]
  prev: DriveState | null
  tick: number
}

export interface DrivesBaseOutput {
  state: DriveState
  hunger: number
  futility: number
  discomfort: number
  boredomFromWait: number
  boredomFromIntention: number
}

/**
 * Limbic module — deterministic felt-state from self, focus, and history.
 * No LLM. Produces a value gradient the PFC can weigh against deliberation.
 */
export function updateDrives(input: DrivesInput): DrivesOutput {
  const base = computeDrivesBase(input)
  return finalizeDrives(base, input.focus, input)
}

/** Parallel-safe pass — runs alongside Thalamus before focus is hydrated. */
export function computeDrivesBase(input: DrivesBaseInput): DrivesBaseOutput {
  const prev = input.prev ?? EMPTY_DRIVE_STATE
  const state: DriveState = {
    ...prev,
    habituation: { ...prev.habituation },
  }

  const lastAction = lastActionFrom(input.recent_events)
  if (lastAction) {
    state.last_action = { kind: lastAction.kind, tick: lastAction.tick }
    if (lastAction.kind === 'wait') {
      state.wait_streak += 1
    } else {
      state.wait_streak = 0
    }
  }

  const intention = input.intention.trim()
  if (intention && intention === state.last_intention) {
    state.intention_streak += 1
  } else {
    state.intention_streak = intention ? 1 : 0
    state.last_intention = intention
  }

  const hunger = clamp01(1 - input.self.food / 20)
  const boredomFromWait = clamp01(state.wait_streak / 5)
  const boredomFromIntention = clamp01(state.intention_streak / 12)

  const moved = positionMoved(state.last_position, input.self.position)
  state.last_position = { ...input.self.position }

  let futility = 0
  if (lastAction && !moved && (lastAction.kind === 'wait' || lastAction.kind === 'mine')) {
    const sameActionTicks = countRecentSameActions(input.recent_events, lastAction.kind)
    futility = clamp01(sameActionTicks / 4)
  }
  if (state.intention_streak >= 8 && !moved) {
    futility = Math.max(futility, clamp01(state.intention_streak / 15))
  }

  const recentFailures = countRecentActionFailures(input.recent_events)
  if (recentFailures >= 1) {
    futility = Math.max(futility, clamp01(recentFailures / 3))
  }

  let discomfort = 0
  if (input.self.health < 10) discomfort = Math.max(discomfort, clamp01(1 - input.self.health / 10))
  if (input.self.motion === 'falling') discomfort = Math.max(discomfort, 0.7)
  if (input.self.in_water) discomfort = Math.max(discomfort, 0.5)
  if (!input.self.on_ground && input.self.motion !== 'falling') {
    discomfort = Math.max(discomfort, 0.4)
  }

  return {
    state,
    hunger,
    futility,
    discomfort,
    boredomFromWait,
    boredomFromIntention,
  }
}

/** Merge focus-dependent boredom/curiosity after Thalamus + hydrate. */
export function finalizeDrives(
  base: DrivesBaseOutput,
  focus: readonly FocusItem[],
  input: Pick<DrivesBaseInput, 'self' | 'intention' | 'tick'>
): DrivesOutput {
  const state = base.state

  const focusKey = focusKeyFrom(focus)
  if (focusKey && state.focus_streak?.key === focusKey) {
    state.focus_streak = { key: focusKey, count: state.focus_streak.count + 1 }
  } else if (focusKey) {
    state.focus_streak = { key: focusKey, count: 1 }
  } else {
    state.focus_streak = null
  }

  for (const f of focus) {
    state.habituation[f.ref] = (state.habituation[f.ref] ?? 0) + 1
  }

  const focusCount = state.focus_streak?.count ?? 0
  const boredomFromFocus = clamp01(focusCount / 10)
  const boredom = Math.max(boredomFromFocus, base.boredomFromWait, base.boredomFromIntention)

  let curiosity = 0.4
  if (focus.length > 0) {
    const exposures = focus.map((f) => state.habituation[f.ref] ?? 0)
    const avgExposure = exposures.reduce((a, b) => a + b, 0) / exposures.length
    curiosity = clamp01(1 - avgExposure / 20)
  }

  const signals: DriveSignals = {
    hunger: base.hunger,
    boredom,
    futility: base.futility,
    curiosity,
    discomfort: base.discomfort,
  }

  const felt = buildFeltLines(signals, state, input.self, focus.length)
  return { signals, felt, state }
}

function focusKeyFrom(focus: readonly FocusItem[]): string | null {
  if (focus.length === 0) return null
  return focus.map((f) => f.ref).sort().join('|')
}

function lastActionFrom(events: readonly EventLogEntry[]): ActionEventLite | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e?.kind === 'action') return { kind: e.action.kind, tick: e.tick }
  }
  return null
}

interface ActionEventLite {
  kind: string
  tick: number
}

function countRecentSameActions(events: readonly EventLogEntry[], kind: string): number {
  let n = 0
  for (let i = events.length - 1; i >= 0 && n < 6; i--) {
    const e = events[i]
    if (e?.kind === 'action') {
      if (e.action.kind === kind) n++
      else break
    }
  }
  return n
}

function countRecentActionFailures(events: readonly EventLogEntry[]): number {
  let n = 0
  for (let i = events.length - 1; i >= 0 && n < 6; i--) {
    const e = events[i]
    if (e?.kind === 'action_outcome') {
      if (!e.ok) n++
      else break
    }
  }
  return n
}

function positionMoved(
  prev: { x: number; y: number; z: number } | null,
  curr: { x: number; y: number; z: number }
): boolean {
  if (!prev) return true
  const dx = curr.x - prev.x
  const dy = curr.y - prev.y
  const dz = curr.z - prev.z
  return dx * dx + dy * dy + dz * dz > 0.25
}

function buildFeltLines(
  s: DriveSignals,
  state: DriveState,
  self: WorkingMemorySelf,
  focusCount: number
): string[] {
  const lines: string[] = []

  if (s.hunger >= 0.25) {
    lines.push(
      `hunger ${fmt(s.hunger)} — food ${self.food}/20` +
        (s.hunger >= 0.6 ? ', stomach is pressing' : '')
    )
  }
  if (s.boredom >= 0.35) {
    const streak = state.focus_streak
    const detail = streak
      ? `same focus (${streak.key}) for ${streak.count} ticks`
      : state.wait_streak >= 3
        ? `waiting repeatedly (${state.wait_streak}×)`
        : `same intention ${state.intention_streak} ticks`
    lines.push(`boredom ${fmt(s.boredom)} — ${detail}`)
  }
  if (s.futility >= 0.35) {
    lines.push(
      `futility ${fmt(s.futility)} — recent actions aren't changing anything`
    )
  }
  if (s.curiosity >= 0.55) {
    lines.push(`curiosity ${fmt(s.curiosity)} — something here still feels new`)
  } else if (s.curiosity <= 0.25 && focusCount > 0) {
    lines.push(`curiosity ${fmt(s.curiosity)} — this is familiar ground`)
  }
  if (s.discomfort >= 0.35) {
    lines.push(`discomfort ${fmt(s.discomfort)} — body wants relief`)
  }

  if (lines.length === 0) {
    lines.push('baseline — nothing urgent, mild openness to whatever comes')
  }

  return lines
}

function fmt(n: number): string {
  return n.toFixed(2)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
