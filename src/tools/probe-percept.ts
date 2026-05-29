/**
 * Perception probe — read-only.
 *
 * Connects a throwaway bot to the same server the agents use and dumps
 * (almost) everything mineflayer exposes about the world from the agent's
 * vantage point. The point is to SEE the full surface so we can decide,
 * together, what belongs in the shared RawPercept — instead of guessing.
 *
 * Run:  pnpm probe
 * It connects, waits to settle, prints a sectioned dump, then disconnects.
 *
 * Notes:
 * - For collections we print a count + a small sample, not everything.
 * - For one representative block and one entity we dump ALL keys, so you
 *   can see every property mineflayer offers (hardness, harvestTools, light,
 *   biome, drops, metadata, …) and decide what's worth perceiving.
 * - Each section is guarded so one failure doesn't kill the whole dump.
 */
import 'dotenv/config'
import mineflayer, { type Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { config } from '../config.js'

const USERNAME = process.env.PROBE_NAME ?? 'Probe'
const SAMPLE = 5

function hr(title: string): void {
  console.log('\n' + '='.repeat(72))
  console.log('  ' + title)
  console.log('='.repeat(72))
}

function show(label: string, value: unknown): void {
  let str: string
  try {
    str = JSON.stringify(value, replacer, 2)
  } catch {
    str = String(value)
  }
  console.log(`${label}: ${str}`)
}

// Trim huge/circular fields so the dump stays readable.
function replacer(key: string, value: unknown): unknown {
  if (key === 'metadata' && Array.isArray(value)) return `<${value.length} metadata entries>`
  if (key === 'nbt' && value) return '<nbt present>'
  if (value instanceof Map) return `<Map ${value.size}>`
  return value
}

function keysOf(label: string, obj: unknown): void {
  if (obj && typeof obj === 'object') {
    console.log(`${label} — all keys:`, Object.keys(obj as object).sort().join(', '))
  } else {
    console.log(`${label}:`, obj)
  }
}

function section(title: string, fn: () => void): void {
  hr(title)
  try {
    fn()
  } catch (err) {
    console.error(`  (section "${title}" failed:`, String(err), ')')
  }
}

function dumpAll(bot: Bot): void {
  const me = bot.entity?.position ?? new Vec3(0, 0, 0)

  section('CONNECTION / GAME', () => {
    show('username', bot.username)
    show('version', bot.version)
    show('game', bot.game)
    show('players', Object.keys(bot.players))
  })

  section('SELF — entity (proprioception)', () => {
    keysOf('bot.entity', bot.entity)
    const e = bot.entity
    show('position', e.position)
    show('velocity', e.velocity)
    show('yaw/pitch', { yaw: e.yaw, pitch: e.pitch })
    show('onGround', e.onGround)
    show('height/width', { height: e.height, width: e.width })
    show('eyeHeight', (e as unknown as { eyeHeight?: number }).eyeHeight)
  })

  section('SELF — vitals', () => {
    show('health', bot.health)
    show('food', bot.food)
    show('foodSaturation', bot.foodSaturation)
    show('oxygenLevel', bot.oxygenLevel)
    show('experience', bot.experience)
    show('isSleeping', bot.isSleeping)
  })

  section('TIME / WEATHER', () => {
    show('time', {
      timeOfDay: bot.time?.timeOfDay,
      day: bot.time?.day,
      age: bot.time?.age,
      isDay: bot.time?.isDay,
      moonPhase: bot.time?.moonPhase,
    })
    show('isRaining', bot.isRaining)
    show('rainState', (bot as unknown as { rainState?: number }).rainState)
    show('thunderState', bot.thunderState)
  })

  section('INVENTORY', () => {
    const items = bot.inventory.items()
    show('item count', items.length)
    if (items[0]) keysOf('one item', items[0])
    show(
      'items',
      items.map((i) => ({ name: i.name, count: i.count, slot: i.slot, displayName: i.displayName }))
    )
    show('heldItem', bot.heldItem?.name ?? null)
    show('quickBarSlot', bot.quickBarSlot)
    show('emptySlots', bot.inventory.emptySlotCount())
  })

  section('ENTITIES (things-not-me)', () => {
    const all = Object.values(bot.entities).filter((e) => e.id !== bot.entity?.id && e.position)
    show('total loaded entities', all.length)
    const byType = new Map<string, number>()
    for (const e of all) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
    show('by type', Object.fromEntries(byType))
    const nearest = all
      .map((e) => ({ e, d: e.position.distanceTo(me) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, SAMPLE)
    if (nearest[0]) keysOf('nearest entity', nearest[0].e)
    show(
      `nearest ${SAMPLE}`,
      nearest.map(({ e, d }) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        username: e.username,
        kind: (e as unknown as { kind?: string }).kind,
        displayName: (e as unknown as { displayName?: string }).displayName,
        dist: Math.round(d * 10) / 10,
        health: (e as unknown as { health?: number }).health,
      }))
    )
  })

  section('BLOCKS — full field set (what a Block exposes)', () => {
    const feet = bot.blockAt(me.offset(0, -1, 0))
    if (feet) {
      keysOf('block at feet', feet)
      show('block at feet — values', {
        name: feet.name,
        type: feet.type,
        stateId: feet.stateId,
        displayName: feet.displayName,
        hardness: feet.hardness,
        diggable: feet.diggable,
        boundingBox: feet.boundingBox,
        material: (feet as unknown as { material?: string }).material,
        harvestTools: (feet as unknown as { harvestTools?: unknown }).harvestTools,
        drops: (feet as unknown as { drops?: unknown }).drops,
        light: (feet as unknown as { light?: number }).light,
        skyLight: (feet as unknown as { skyLight?: number }).skyLight,
        biome: feetBiome(feet),
      })
      show('canDigBlock(feet)', bot.canDigBlock(feet))
      try {
        show('digTime(feet) ms', bot.digTime(feet))
      } catch {
        /* digTime signature varies by version */
      }
    }
  })

  section('LINE OF SIGHT (honest FOV primitives)', () => {
    const looking = bot.blockAtCursor(8)
    show('blockAtCursor(8)', looking ? { name: looking.name, position: looking.position } : null)
    // raycast is the honest "what can I actually see" primitive worth noting.
    show('world.raycast available', typeof (bot.world as unknown as { raycast?: unknown }).raycast)
  })

  section('FINDBLOCKS — what is queryable (note: this is the x-ray capability)', () => {
    const within = (matcher: (name: string) => boolean, max = 16, count = 256): number =>
      bot.findBlocks({ matching: (b) => matcher(b.name), maxDistance: max, count }).length
    show('trees (logs/leaves) within 16', within((n) => n.endsWith('_log') || n.endsWith('_leaves')))
    show('any *_ore within 16 (incl. BURIED — x-ray)', within((n) => n.endsWith('_ore')))
    show('water within 16', within((n) => n === 'water'))
    show('stone-family within 16', within((n) => n === 'stone' || n.startsWith('deepslate')))
  })

  section('REGISTRY (static knowledge available without perceiving)', () => {
    const r = bot.registry
    show('blocks count', Object.keys(r.blocksByName).length)
    show('items count', Object.keys(r.itemsByName).length)
    show('biomes count', Object.keys(r.biomes).length)
    show('entities count', Object.keys(r.entitiesByName ?? {}).length)
    show('foods count', Object.keys(r.foodsByName ?? {}).length)
    show('sample: diamond block def', r.blocksByName['diamond_ore'] ?? r.blocksByName['deepslate_diamond_ore'])
  })

  section('ACTION API — actions are CALLABLE METHODS, not part of state', () => {
    // mineflayer does NOT surface "available actions" as data. It exposes
    // imperative methods you may call. There is no bot.getActions(). The
    // agent's action vocabulary is something WE design (MINECRAFT_ACTIONS),
    // not something read from the game.
    const verbs = [
      'dig', 'stopDigging', 'placeBlock', 'activateBlock', 'activateItem',
      'deactivateItem', 'attack', 'swingArm', 'equip', 'unequip', 'toss',
      'tossStack', 'consume', 'sleep', 'wake', 'lookAt', 'look',
      'setControlState', 'clearControlStates', 'chat', 'whisper',
      'setQuickBarSlot', 'craft', 'recipesFor', 'recipesAll', 'openContainer',
      'moveSlotItem', 'collectBlock',
    ]
    const present = verbs.filter((v) => typeof (bot as unknown as Record<string, unknown>)[v] === 'function')
    const missing = verbs.filter((v) => !present.includes(v))
    show('callable action methods present', present)
    show('not present (plugin/version dependent)', missing)
    show('pathfinder loaded (locomotion)', typeof (bot as unknown as { pathfinder?: unknown }).pathfinder)
    // SMELTING for the diamond path: there is no smelt() primitive — it is a
    // multi-step furnace container interaction. Confirm the shape:
    show('openContainer exists (furnace/chest interaction)', typeof bot.openContainer)
    console.log(
      '  NOTE: smelting iron (required for the diamond tree) = openContainer(furnace) →\n' +
      '        putFuel + putInput + takeOutput. No single "smelt" action exists.'
    )
  })

  section('WORLD CENSUS — true extent of what the client knows (loaded chunks, NO occlusion)', () => {
    const bx = Math.floor(me.x), by = Math.floor(me.y), bz = Math.floor(me.z)
    const minY = (bot.game as unknown as { minY?: number }).minY ?? -64
    // Vertical x-ray: straight down to bedrock at the bot's column.
    const column: string[] = []
    let run: { name: string; from: number } | null = null
    for (let y = by; y >= minY; y--) {
      const b = bot.blockAt(new Vec3(bx, y, bz))
      const name = b?.name ?? 'unloaded'
      if (!run) run = { name, from: y }
      else if (run.name !== name) {
        column.push(`y${run.from}..${y + 1}: ${run.name}`)
        run = { name, from: y }
      }
    }
    if (run) column.push(`y${run.from}..${minY}: ${run.name}`)
    console.log('  Column straight DOWN through solid rock to bedrock (this is x-ray):')
    for (const line of column) console.log('    ' + line)

    // Breadth census: tally every block name in a small cube around the bot.
    const tally = new Map<string, number>()
    const R = 6
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++)
        for (let dy = -20; dy <= 4; dy++) {
          const b = bot.blockAt(new Vec3(bx + dx, by + dy, bz + dz))
          if (!b || b.name === 'air' || b.name === 'cave_air') continue
          tally.set(b.name, (tally.get(b.name) ?? 0) + 1)
        }
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log(`  Block census in ${2 * R + 1}×${2 * R + 1}×25 cube around bot (every block, incl. buried):`)
    for (const [name, n] of sorted) console.log(`    ${n.toString().padStart(5)} ${name}`)
  })

  hr('PROBE COMPLETE — review the above, then we decide what RawPercept should carry')
}

function feetBiome(block: { biome?: unknown }): unknown {
  const b = block.biome as { id?: number; name?: string } | number | undefined
  if (typeof b === 'number') return b
  if (b && typeof b === 'object') return { id: b.id, name: b.name }
  return b
}

function main(): void {
  console.log(`[probe] connecting ${USERNAME} → ${config.mc.host}:${config.mc.port} (${config.mc.version})`)
  const bot = mineflayer.createBot({
    host: config.mc.host,
    port: config.mc.port,
    version: config.mc.version,
    username: USERNAME,
    auth: 'offline',
  })

  bot.once('spawn', () => {
    void (async () => {
      try {
        await bot.waitForChunksToLoad()
      } catch {
        /* continue even if chunk load times out */
      }
      await bot.waitForTicks(20) // let physics + nearby chunks settle
      dumpAll(bot)
      bot.quit()
      setTimeout(() => process.exit(0), 500)
    })()
  })

  bot.on('error', (err) => {
    console.error('[probe] bot error:', String(err))
    process.exit(1)
  })
  bot.on('kicked', (reason) => {
    console.error('[probe] kicked:', String(reason))
    process.exit(1)
  })
}

main()
