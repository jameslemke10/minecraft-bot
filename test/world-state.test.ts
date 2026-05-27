import { describe, it, expect } from 'vitest'
import { WorldState } from '../src/body/world-state.js'

describe('WorldState', () => {
  it('snapshot is a deep copy disconnected from live state', () => {
    const w = new WorldState()
    w.position = { x: 1, y: 2, z: 3 }
    const s1 = w.snapshot()

    w.position = { x: 99, y: 99, z: 99 }
    expect(s1.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('snapshot is deep-frozen', () => {
    const w = new WorldState()
    w.inventory = [{ name: 'dirt', count: 1, slot: 0 }]
    const s = w.snapshot()

    expect(Object.isFrozen(s)).toBe(true)
    expect(Object.isFrozen(s.position)).toBe(true)
    expect(Object.isFrozen(s.inventory)).toBe(true)
    expect(Object.isFrozen(s.inventory[0])).toBe(true)
  })

  it('recentEvents is a bounded ring buffer', () => {
    const w = new WorldState()
    for (let i = 0; i < 50; i++) w.pushEvent(`e${i}`)
    const s = w.snapshot()
    expect(s.recentEvents.length).toBe(20)
    expect(s.recentEvents[0]).toBe('e30')
    expect(s.recentEvents.at(-1)).toBe('e49')
  })
})
