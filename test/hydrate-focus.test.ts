import { describe, it, expect } from 'vitest'
import { hydrateFocus } from '../src/brain/schedule.js'
import type { BodyHints, RawPercept } from '../src/body/types.js'
import type { FocusRef } from '../src/brain/types.js'

const EMPTY_PERCEPT: RawPercept = {
  self: {
    position: { x: 0, y: 64, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 20,
    food: 20,
    on_ground: true,
    in_water: false,
    motion: 'still',
    inventory: [],
    held_item: null,
  },
  terrain: {
    biome: 'plains',
    time_of_day: 'day',
    time_ticks: 0,
    weather: 'clear',
    block_at_feet: 'grass_block',
    block_looking_at: null,
  },
  scene: { heightmap: '', objects: [] },
  nearby_entities: [],
  new_events: [],
  tick: 1,
  timestamp: 0,
}

describe('hydrateFocus body.mineable', () => {
  it('resolves mineable refs from body hints', () => {
    const hints: BodyHints = {
      craftable: [],
      crafting_table_nearby: false,
      mineable: [
        { id: 'mineable:0', x: 1, y: 63, z: 0, block: 'dirt', relation: 'below' },
      ],
    }
    const refs: FocusRef[] = [
      { source: 'body.mineable', id: 'mineable:0', why: 'dig down' },
    ]
    const focus = hydrateFocus(EMPTY_PERCEPT, [], refs, hints)
    expect(focus).toHaveLength(1)
    expect(focus[0]?.ref).toBe('body.mineable/mineable:0')
    expect(focus[0]?.data).toEqual(hints.mineable[0])
  })

  it('drops mineable ref when body hints missing', () => {
    const refs: FocusRef[] = [
      { source: 'body.mineable', id: 'mineable:0', why: 'dig down' },
    ]
    const focus = hydrateFocus(EMPTY_PERCEPT, [], refs)
    expect(focus).toHaveLength(0)
  })
})
