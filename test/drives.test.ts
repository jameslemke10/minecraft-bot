import { describe, it, expect } from 'vitest'
import { updateDrives, EMPTY_DRIVE_STATE } from '../src/brain/drives.js'
import type { FocusItem, WorkingMemorySelf } from '../src/brain/types.js'

const SELF: WorkingMemorySelf = {
  position: { x: 0, y: 64, z: 0 },
  yaw: 0,
  pitch: 0,
  health: 20,
  food: 20,
  on_ground: true,
  in_water: false,
  motion: 'still',
}

const focusSheep: FocusItem = {
  source: 'entities',
  ref: 'entities/42',
  data: { id: 42, name: 'Sheep', type: 'sheep' },
  why: 'moving nearby',
}

describe('updateDrives', () => {
  it('reports low urgency at baseline', () => {
    const out = updateDrives({
      self: SELF,
      focus: [],
      intention: '',
      recent_events: [],
      prev: null,
      tick: 1,
    })
    expect(out.signals.hunger).toBe(0)
    expect(out.signals.boredom).toBe(0)
    expect(out.felt.some((l) => l.includes('baseline'))).toBe(true)
  })

  it('raises hunger as food drops', () => {
    const out = updateDrives({
      self: { ...SELF, food: 6 },
      focus: [],
      intention: '',
      recent_events: [],
      prev: null,
      tick: 1,
    })
    expect(out.signals.hunger).toBeGreaterThan(0.65)
    expect(out.felt.some((l) => l.includes('hunger'))).toBe(true)
  })

  it('raises boredom when focus stays on the same ref', () => {
    let state = EMPTY_DRIVE_STATE
    let boredom = 0
    for (let tick = 1; tick <= 12; tick++) {
      const out = updateDrives({
        self: SELF,
        focus: [focusSheep],
        intention: 'watch the sheep',
        recent_events: [],
        prev: state,
        tick,
      })
      state = out.state
      boredom = out.signals.boredom
    }
    expect(boredom).toBeGreaterThan(0.8)
    expect(state.focus_streak).toEqual({ key: 'entities/42', count: 12 })
  })

  it('raises futility and boredom on repeated wait without moving', () => {
    let state = EMPTY_DRIVE_STATE
    let signals = { futility: 0, boredom: 0 }
    for (let tick = 1; tick <= 6; tick++) {
      const events = Array.from({ length: tick }, (_, i) => ({
        kind: 'action' as const,
        tick: i + 1,
        action: { kind: 'wait' as const, args: { ms: 1000 } },
      }))
      const out = updateDrives({
        self: SELF,
        focus: [focusSheep],
        intention: 'keep waiting',
        recent_events: events,
        prev: state,
        tick,
      })
      state = out.state
      signals = out.signals
    }
    expect(signals.futility).toBeGreaterThan(0.5)
    expect(signals.boredom).toBeGreaterThan(0.5)
  })

  it('lowers curiosity as habituation accumulates', () => {
    let state = EMPTY_DRIVE_STATE
    let curiosity = 1
    for (let tick = 1; tick <= 25; tick++) {
      const out = updateDrives({
        self: SELF,
        focus: [focusSheep],
        intention: 'observe',
        recent_events: [],
        prev: state,
        tick,
      })
      state = out.state
      curiosity = out.signals.curiosity
    }
    expect(curiosity).toBeLessThan(0.3)
    expect(state.habituation['entities/42']).toBe(25)
  })

  it('raises futility on repeated action failures', () => {
    const events = [
      { kind: 'action' as const, tick: 1, action: { kind: 'mine' as const, args: { x: 0, y: 0, z: 0 } } },
      { kind: 'action_outcome' as const, tick: 1, action: { kind: 'mine' as const, args: { x: 0, y: 0, z: 0 } }, ok: false, message: 'cannot dig' },
      { kind: 'action' as const, tick: 2, action: { kind: 'mine' as const, args: { x: 0, y: 0, z: 0 } } },
      { kind: 'action_outcome' as const, tick: 2, action: { kind: 'mine' as const, args: { x: 0, y: 0, z: 0 } }, ok: false, message: 'cannot dig' },
    ]
    const out = updateDrives({
      self: SELF,
      focus: [],
      intention: 'mine copper',
      recent_events: events,
      prev: null,
      tick: 3,
    })
    expect(out.signals.futility).toBeGreaterThan(0.5)
  })

  it('raises discomfort when falling or low health', () => {
    const falling = updateDrives({
      self: { ...SELF, motion: 'falling', on_ground: false },
      focus: [],
      intention: '',
      recent_events: [],
      prev: null,
      tick: 1,
    })
    expect(falling.signals.discomfort).toBeGreaterThanOrEqual(0.7)

    const hurt = updateDrives({
      self: { ...SELF, health: 4 },
      focus: [],
      intention: '',
      recent_events: [],
      prev: null,
      tick: 1,
    })
    expect(hurt.signals.discomfort).toBeGreaterThan(0.5)
  })
})
