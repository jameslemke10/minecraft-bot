/**
 * Terminal HUD for a running Dimitri instance.
 * Reads the live state.json from the newest run dir.
 *
 *   pnpm dimitri:watch
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = 'src/agents/dimitri/data/runs'

function latestRunDir(): string | null {
  if (!existsSync(DATA_DIR)) return null
  const dirs = readdirSync(DATA_DIR)
    .map((name) => join(DATA_DIR, name))
    .filter((p) => statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return dirs[0] ?? null
}

function clear(): void {
  process.stdout.write('\x1Bc')
}

function render(statePath: string): void {
  let raw: string
  try {
    raw = readFileSync(statePath, 'utf8')
  } catch {
    console.log('Waiting for state.json… (is Dimitri running?)')
    return
  }
  let s: {
    tick: number
    phase: string
    phaseDetail?: string
    milestone: { score: number; label: string; max: number }
    self: {
      position: { x: number; y: number; z: number }
      health: number
      food: number
      held_item: string | null
      inventory: Array<{ name: string; count: number }>
    }
    thought?: string
    action?: unknown
    outcome?: { ok: boolean; message: string }
    recentHistory?: string[]
    updatedAt: string
  }
  try {
    s = JSON.parse(raw)
  } catch {
    console.log('state.json parse error — retrying…')
    return
  }

  clear()
  const phase = s.phaseDetail ? `${s.phase} (${s.phaseDetail})` : s.phase
  console.log('═══════════════════════════════════════════════════════')
  console.log('  DIMITRI LIVE  —  dashboard: http://localhost:3022')
  console.log('  3D view:       http://localhost:3020  (open in new tab)')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`tick ${s.tick}  |  ${phase}  |  updated ${s.updatedAt}`)
  console.log(
    `progress ${s.milestone.score}/${s.milestone.max} (${s.milestone.label})  |  ` +
      `pos ${s.self.position.x.toFixed(1)}, ${s.self.position.y.toFixed(1)}, ${s.self.position.z.toFixed(1)}  |  ` +
      `hp ${s.self.health}/20  food ${s.self.food}/20`
  )
  console.log(`held: ${s.self.held_item ?? '(nothing)'}`)
  const inv =
    s.self.inventory.length === 0
      ? '(empty — mined items may be on the ground)'
      : s.self.inventory.map((i) => `${i.count}×${i.name}`).join(', ')
  console.log(`inventory: ${inv}`)
  if (s.thought) console.log(`\nTHOUGHT: ${s.thought}`)
  if (s.action) console.log(`ACTION:  ${JSON.stringify(s.action)}`)
  if (s.outcome) console.log(`OUTCOME: ${s.outcome.ok ? 'ok' : 'FAIL'} — ${s.outcome.message}`)
  if (s.recentHistory?.length) {
    console.log('\nRECENT:')
    for (const line of s.recentHistory.slice(-5)) console.log(`  ${line}`)
  }
  console.log('\n(Ctrl+C to stop watching)')
}

const runDir = latestRunDir()
if (!runDir) {
  console.error('No Dimitri run dir found. Start with: pnpm dimitri')
  process.exit(1)
}

const statePath = join(runDir, 'state.json')
console.log(`Watching ${statePath}\n`)

render(statePath)
setInterval(() => render(statePath), 1500)
