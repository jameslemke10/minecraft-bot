/**
 * Readable post-run review for Dimitri context + decisions.
 *
 *   pnpm dimitri:review                    # latest run
 *   pnpm dimitri:review -- tick 40         # one tick
 *   pnpm dimitri:review -- run 2026-05-29T20-09-02-618Z
 *   pnpm dimitri:review -- out review.md   # write markdown file
 */
import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RUNS_DIR = 'src/agents/dimitri/data/runs'

interface TickRow {
  tick: number
  thought: string
  action: { kind: string; args: Record<string, unknown> } | null
  action_outcome: { ok: boolean; message: string }
}

interface ContextRow {
  tick: number
  pass: string[]
  remove: string[]
  verbs: string[]
  hydrated: string
  thought: string
  action: { kind: string; args: Record<string, unknown> } | null
  outcome: { ok: boolean; message: string }
}

interface ProgressRow {
  tick: number
  score: number
  label: string
}

function parseArgs(argv: string[]): { runId?: string; tick?: number; out?: string } {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const opts: { runId?: string; tick?: number; out?: string } = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--run' || a === 'run') opts.runId = args[++i]
    else if (a === '--tick' || a === 'tick') opts.tick = Number(args[++i])
    else if (a === '--out' || a === 'out') opts.out = args[++i]
  }
  return opts
}

function latestRunDir(): string | null {
  if (!existsSync(RUNS_DIR)) return null
  const dirs = readdirSync(RUNS_DIR)
    .map((name) => join(RUNS_DIR, name))
    .filter((p) => statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return dirs[0] ?? null
}

function resolveRunDir(runId?: string): string {
  if (runId) {
    const p = join(RUNS_DIR, runId)
    if (!existsSync(p)) throw new Error(`Run not found: ${p}`)
    return p
  }
  const latest = latestRunDir()
  if (!latest) throw new Error(`No runs in ${RUNS_DIR}`)
  return latest
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function actionStr(action: TickRow['action']): string {
  if (!action) return '(none)'
  return `${action.kind}(${JSON.stringify(action.args)})`
}

function outcomeStr(o: { ok: boolean; message: string }): string {
  return o.ok ? `OK: ${o.message}` : `FAIL: ${o.message}`
}

function renderTick(ctx: ContextRow | undefined, tick: TickRow, prog?: ProgressRow): string {
  const lines: string[] = []
  const header = prog
    ? `## Tick ${tick.tick} — ${prog.label} (score ${prog.score})`
    : `## Tick ${tick.tick}`
  lines.push(header, '')

  if (ctx) {
    lines.push('### Curator pass')
    lines.push('```')
    lines.push(`pass:   ${ctx.pass.join(', ')}`)
    lines.push(`remove: ${ctx.remove.length ? ctx.remove.join(', ') : '(none)'}`)
    lines.push(`verbs:  ${ctx.verbs.join(', ') || '(none)'}`)
    lines.push('```', '')
    lines.push('### Executive context (hydrated)')
    lines.push('```')
    lines.push(ctx.hydrated)
    lines.push('```', '')
  } else {
    lines.push('_No context.jsonl for this tick (run predates context logging)._', '')
  }

  lines.push('### Decision')
  lines.push(`**Thought:** ${tick.thought}`, '')
  lines.push(`**Action:** \`${actionStr(tick.action)}\``)
  lines.push(`**Outcome:** ${outcomeStr(tick.action_outcome)}`, '')
  lines.push('---', '')
  return lines.join('\n')
}

function buildReview(runDir: string, onlyTick?: number): string {
  const runId = runDir.split('/').pop() ?? runDir
  const ticks = readJsonl<TickRow>(join(runDir, 'ticks.jsonl'))
  const contexts = readJsonl<ContextRow>(join(runDir, 'context.jsonl'))
  const progress = readJsonl<ProgressRow>(join(runDir, 'progress.jsonl'))
  const ctxByTick = new Map(contexts.map((c) => [c.tick, c]))
  const progByTick = new Map(progress.map((p) => [p.tick, p]))

  const filtered = onlyTick !== undefined ? ticks.filter((t) => t.tick === onlyTick) : ticks
  if (filtered.length === 0) {
    throw new Error(onlyTick !== undefined ? `No tick ${onlyTick} in run` : 'No ticks in run')
  }

  const fails = ticks.filter((t) => !t.action_outcome.ok)
  const mines = ticks.filter((t) => t.action?.kind === 'mine')
  const mineFails = mines.filter((t) => !t.action_outcome.ok)

  const summary: string[] = [
    `# Dimitri run review — ${runId}`,
    '',
    '## Summary',
    '',
    `- Ticks: ${ticks.length}`,
    `- Failures: ${fails.length}`,
    `- Mine actions: ${mines.length} (${mineFails.length} failed)`,
    '',
  ]

  if (mineFails.length) {
    summary.push('### Failed mines')
    for (const t of mineFails) {
      summary.push(`- t${t.tick}: \`${actionStr(t.action)}\` → ${t.action_outcome.message}`)
    }
    summary.push('')
  }

  if (contexts.length === 0) {
    summary.push(
      '> **Note:** This run has no `context.jsonl`. Re-run Dimitri after updating to capture curator pass + hydrated executive prompt each tick.',
      ''
    )
  }

  const body = filtered.map((t) => renderTick(ctxByTick.get(t.tick), t, progByTick.get(t.tick))).join('\n')
  return summary.join('\n') + body
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const runDir = resolveRunDir(opts.runId)
  const md = buildReview(runDir, opts.tick)

  if (opts.out) {
    const outPath = opts.out.includes('/') ? opts.out : join(runDir, opts.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, md)
    console.log(`Wrote ${outPath}`)
  } else {
    console.log(md)
  }
}

main()
