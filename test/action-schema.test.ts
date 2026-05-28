import { describe, it, expect } from 'vitest'
import { ActionSchema } from '../src/brain/types.js'

describe('ActionSchema', () => {
  it('accepts a well-formed move action', () => {
    const parsed = ActionSchema.safeParse({ kind: 'move', args: { x: 10, z: -5 } })
    expect(parsed.success).toBe(true)
  })

  it('accepts a well-formed chat action', () => {
    const parsed = ActionSchema.safeParse({ kind: 'chat', args: { msg: 'hello' } })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown action kind', () => {
    const parsed = ActionSchema.safeParse({ kind: 'teleport', args: {} })
    expect(parsed.success).toBe(false)
  })

  it('rejects move with missing args', () => {
    const parsed = ActionSchema.safeParse({ kind: 'move', args: { x: 10 } })
    expect(parsed.success).toBe(false)
  })

  it('rejects chat with empty message', () => {
    const parsed = ActionSchema.safeParse({ kind: 'chat', args: { msg: '' } })
    expect(parsed.success).toBe(false)
  })

  it('rejects wait with absurd duration', () => {
    const parsed = ActionSchema.safeParse({ kind: 'wait', args: { ms: 999_999 } })
    expect(parsed.success).toBe(false)
  })

  it('accepts mine with coords', () => {
    const parsed = ActionSchema.safeParse({ kind: 'mine', args: { x: 20, y: 64, z: 4 } })
    expect(parsed.success).toBe(true)
  })

  it('accepts place with block name', () => {
    const parsed = ActionSchema.safeParse({
      kind: 'place',
      args: { x: 10, y: 65, z: 0, block: 'dirt' },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts craft with optional count', () => {
    const a = ActionSchema.safeParse({ kind: 'craft', args: { item: 'oak_planks' } })
    const b = ActionSchema.safeParse({ kind: 'craft', args: { item: 'oak_planks', count: 4 } })
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)
  })

  it('accepts equip / attack / eat / sleep', () => {
    expect(ActionSchema.safeParse({ kind: 'equip', args: { item: 'wooden_pickaxe' } }).success).toBe(true)
    expect(ActionSchema.safeParse({ kind: 'attack', args: { entityId: 42 } }).success).toBe(true)
    expect(ActionSchema.safeParse({ kind: 'eat', args: {} }).success).toBe(true)
    expect(ActionSchema.safeParse({ kind: 'eat', args: { item: 'apple' } }).success).toBe(true)
    expect(ActionSchema.safeParse({ kind: 'sleep', args: {} }).success).toBe(true)
  })

  it('rejects mine missing y coord', () => {
    const parsed = ActionSchema.safeParse({ kind: 'mine', args: { x: 10, z: 5 } })
    expect(parsed.success).toBe(false)
  })
})
