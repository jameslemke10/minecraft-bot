import { describe, it, expect } from 'vitest'
import { Workspace } from '../src/brain/workspace.js'
import type {
  EventLogEntry,
  ThoughtEvent,
  WorkingMemorySelf,
} from '../src/brain/types.js'

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

const thought = (tick: number, text = `t${tick}`): ThoughtEvent => ({
  kind: 'thought',
  tick,
  text,
  intention: 'go',
})

describe('Workspace', () => {
  it('initializes empty', () => {
    const w = Workspace.init('I am Atticus.', SELF)
    const raw = w.raw()
    expect(raw.identity).toBe('I am Atticus.')
    expect(raw.event_log).toEqual([])
    expect(raw.intention).toBe('')
    expect(raw.tick).toBe(0)
  })

  it('updateSelfAndTick writes self and tick', () => {
    const w = Workspace.init('id', SELF)
    w.updateSelfAndTick({ ...SELF, health: 18 }, 5)
    const raw = w.raw()
    expect(raw.self.health).toBe(18)
    expect(raw.tick).toBe(5)
    expect(w.lastTick).toBe(5)
  })

  it('appendEvent adds and trims to 50', () => {
    const w = Workspace.init('id', SELF)
    for (let i = 0; i < 60; i++) w.appendEvent(thought(i))
    const raw = w.raw()
    expect(raw.event_log.length).toBe(50)
    expect(raw.event_log[0]?.tick).toBe(10)
    expect(raw.event_log.at(-1)?.tick).toBe(59)
  })

  it('setIntention writes intention', () => {
    const w = Workspace.init('id', SELF)
    w.setIntention('chop the oak')
    expect(w.raw().intention).toBe('chop the oak')
  })

  it('sliceForThalamus exposes identity, intention, last N events', () => {
    const w = Workspace.init('id', SELF)
    for (let i = 0; i < 12; i++) w.appendEvent(thought(i))
    const slice = w.sliceForThalamus(10)
    expect(Object.keys(slice).sort()).toEqual(['identity', 'intention', 'recent_events'])
    expect(slice.recent_events.length).toBe(10)
    expect(slice.recent_events[0]?.tick).toBe(2)
    expect(slice.recent_events.at(-1)?.tick).toBe(11)
  })

  it('handles mixed event kinds', () => {
    const w = Workspace.init('id', SELF)
    const events: EventLogEntry[] = [
      thought(1, 'I see a tree'),
      { kind: 'action', tick: 1, action: { kind: 'move', args: { x: 10, z: 5 } } },
      { kind: 'damage', tick: 2, amount: 4, source: 'arrow' },
      { kind: 'percept_change', tick: 2, delta: 'skeleton appeared' },
      { kind: 'chat', tick: 3, sender: 'player', text: 'hi' },
    ]
    for (const e of events) w.appendEvent(e)
    const log = w.raw().event_log
    expect(log.length).toBe(5)
    expect(log.map((e) => e.kind)).toEqual([
      'thought', 'action', 'damage', 'percept_change', 'chat',
    ])
  })
})
