import { describe, it, expect } from 'vitest'
import { WorldState } from '../src/body/minecraft/world-state.js'

describe('WorldState', () => {
  it('records pushed events in order', () => {
    const w = new WorldState()
    w.pushEvent('a')
    w.pushEvent('b')
    w.pushEvent('c')
    expect(w.getEvents()).toEqual(['a', 'b', 'c'])
  })

  it('caps event ring buffer at 20 entries', () => {
    const w = new WorldState()
    for (let i = 0; i < 50; i++) w.pushEvent(`e${i}`)
    const events = w.getEvents()
    expect(events.length).toBe(20)
    expect(events[0]).toBe('e30')
    expect(events.at(-1)).toBe('e49')
  })
})
