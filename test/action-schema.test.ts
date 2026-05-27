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
})
