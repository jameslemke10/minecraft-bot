import { describe, it, expect } from 'vitest'
import { WorldState } from '../src/body/minecraft/world-state.js'

describe('WorldState', () => {
  it('drains pushed events with the supplied tick', () => {
    const w = new WorldState()
    w.pushEvent({ kind: 'percept_change', delta: 'a' })
    w.pushEvent({ kind: 'percept_change', delta: 'b' })
    w.pushEvent({ kind: 'damage', amount: 3, source: 'arrow' })
    const drained = w.drainEvents(7)
    expect(drained).toEqual([
      { kind: 'percept_change', delta: 'a', tick: 7 },
      { kind: 'percept_change', delta: 'b', tick: 7 },
      { kind: 'damage', amount: 3, source: 'arrow', tick: 7 },
    ])
    // Second drain after no pushes is empty.
    expect(w.drainEvents(8)).toEqual([])
  })

  it('caps buffered events at 50', () => {
    const w = new WorldState()
    for (let i = 0; i < 80; i++) w.pushEvent({ kind: 'percept_change', delta: `e${i}` })
    const drained = w.drainEvents(0)
    expect(drained.length).toBe(50)
    expect(drained[0]).toMatchObject({ delta: 'e30' })
    expect(drained.at(-1)).toMatchObject({ delta: 'e79' })
  })
})
