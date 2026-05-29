import { describe, it, expect } from 'vitest'
import { ActionSchema } from '../src/body/minecraft/general/actions.js'
import { validateExecutiveAction } from '../src/agents/dimitri/validate-action.js'

describe('general ActionSchema', () => {
  it('accepts move with optional y', () => {
    expect(ActionSchema.safeParse({ kind: 'move', args: { x: 10, z: -5 } }).success).toBe(true)
    expect(ActionSchema.safeParse({ kind: 'move', args: { x: 10, z: -5, y: 64 } }).success).toBe(true)
  })

  it('rejects place without block', () => {
    expect(ActionSchema.safeParse({ kind: 'place', args: { x: 1, y: 2, z: 3 } }).success).toBe(false)
  })
})

describe('validateExecutiveAction', () => {
  it('surfaces place missing block instead of silent null', () => {
    const r = validateExecutiveAction(
      { kind: 'place', args: { x: 2, y: 101, z: 82 } },
      ['place'],
      0
    )
    expect(r.action).toBeNull()
    expect(r.error).toMatch(/place rejected.*block/i)
  })

  it('surfaces verb not in play', () => {
    const r = validateExecutiveAction({ kind: 'smelt', args: { input: 'a', fuel: 'b' } }, ['mine'], 1)
    expect(r.error).toMatch(/not in available verbs/)
  })
})
