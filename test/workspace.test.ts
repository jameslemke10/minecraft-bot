import { describe, it, expect } from 'vitest'
import { Workspace } from '../src/brain/workspace.js'
import type { SalientItem, Thought, WorkingMemorySelf } from '../src/brain/types.js'

const SELF: WorkingMemorySelf = {
  position: { x: 0, y: 64, z: 0 },
  yaw: 0,
  pitch: 0,
  health: 20,
  food: 20,
  on_ground: true,
  in_water: false,
}

const SALIENT: SalientItem[] = [
  { what: 'an oak tree', where: 'east', distance: 5, why: 'first vegetation' },
]

describe('Workspace', () => {
  it('initializes with identity, empty salient, and empty thoughts', () => {
    const w = new Workspace('I am Atticus.', SELF)
    const raw = w.raw()
    expect(raw.identity).toBe('I am Atticus.')
    expect(raw.salient).toEqual([])
    expect(raw.recent_thoughts).toEqual([])
    expect(raw.tick).toBe(0)
  })

  it('Attention patch writes self, salient, and tick', () => {
    const w = new Workspace('id', SELF)
    w.patchFromAttention({ self: { ...SELF, health: 18 }, salient: SALIENT, tick: 5 })
    const raw = w.raw()
    expect(raw.self.health).toBe(18)
    expect(raw.salient).toEqual(SALIENT)
    expect(raw.tick).toBe(5)
  })

  it('Executive patch appends thought and updates intention', () => {
    const w = new Workspace('id', SELF)
    const t: Thought = { tick: 1, text: 'I see a tree', intention: 'walk to it' }
    w.patchFromExecutive({ thought: t, intention: 'walk to it' })
    const raw = w.raw()
    expect(raw.recent_thoughts).toEqual([t])
    expect(raw.intention).toBe('walk to it')
  })

  it('trims recent_thoughts to 5 most recent', () => {
    const w = new Workspace('id', SELF)
    for (let i = 0; i < 10; i++) {
      w.patchFromExecutive({
        thought: { tick: i, text: `thought ${i}`, intention: '' },
        intention: '',
      })
    }
    const raw = w.raw()
    expect(raw.recent_thoughts.length).toBe(5)
    expect(raw.recent_thoughts[0]?.tick).toBe(5)
    expect(raw.recent_thoughts.at(-1)?.tick).toBe(9)
  })

  it('sliceForAttention exposes only identity, intention, recent_thoughts', () => {
    const w = new Workspace('id', SELF)
    w.patchFromAttention({ self: SELF, salient: SALIENT, tick: 1 })
    w.patchFromExecutive({
      thought: { tick: 1, text: 'hi', intention: 'go' },
      intention: 'go',
    })
    const slice = w.sliceForAttention()
    expect(Object.keys(slice).sort()).toEqual(['identity', 'intention', 'recent_thoughts'])
  })

  it('sliceForExecutive exposes identity, self, salient, intention, recent_thoughts', () => {
    const w = new Workspace('id', SELF)
    w.patchFromAttention({ self: SELF, salient: SALIENT, tick: 1 })
    const slice = w.sliceForExecutive()
    expect(Object.keys(slice).sort()).toEqual([
      'identity',
      'intention',
      'recent_thoughts',
      'salient',
      'self',
    ])
    expect(slice.salient).toEqual(SALIENT)
  })
})
