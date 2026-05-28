import { createWriteStream, mkdirSync, writeFileSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { ActionResult } from '../body/action-result.js'
import type { BodyHints } from '../body/types.js'
import type { Action, DriveSignals, DrivesOutput, ThalamusOutput } from '../brain/types.js'
import type { Metrics, MetricsSummary, DriveAggregate } from '../llm/metrics.js'

export interface TickLogEntry {
  tick: number
  thalamus?: ThalamusOutput
  drives?: { signals: DriveSignals; felt: string[] }
  thought?: string
  intention?: string
  action?: Action | null
  action_outcome?: ActionResult
  body_hints?: BodyHints
}

export interface LlmLogEntry {
  caller: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  system: string
  user: string
  response: string
}

export class RunLog {
  readonly runDir: string
  private ticksStream: WriteStream
  private llmStream: WriteStream
  private driveSamples: DriveSignals[] = []
  private finalized = false

  constructor(
    readonly agentId: string,
    dataDir: string
  ) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    this.runDir = join(dataDir, 'runs', ts)
    mkdirSync(this.runDir, { recursive: true })
    writeFileSync(
      join(this.runDir, 'meta.json'),
      JSON.stringify({ agentId, startedAt: new Date().toISOString() }, null, 2)
    )
    this.ticksStream = createWriteStream(join(this.runDir, 'ticks.jsonl'))
    this.llmStream = createWriteStream(join(this.runDir, 'llm.jsonl'))
  }

  recordLlm(entry: LlmLogEntry): void {
    this.llmStream.write(JSON.stringify(entry) + '\n')
  }

  recordTick(entry: TickLogEntry): void {
    this.ticksStream.write(JSON.stringify(entry) + '\n')
  }

  recordDrives(signals: DriveSignals): void {
    this.driveSamples.push({ ...signals })
  }

  driveAggregate(): DriveAggregate | undefined {
    if (this.driveSamples.length === 0) return undefined
    return aggregateDrives(this.driveSamples)
  }

  finalize(metrics: Metrics): void {
    if (this.finalized) return
    this.finalized = true

    const mSummary = metrics.summary()
    const drives = this.driveAggregate()
    const summary = { metrics: mSummary, ...(drives ? { drives } : {}) }

    writeFileSync(join(this.runDir, 'summary.json'), JSON.stringify(summary, null, 2))
    this.ticksStream.end()
    this.llmStream.end()

    process.stderr.write('\n' + formatRunSummary(mSummary, drives) + '\n')
    metrics.markPrinted()
  }
}

export function aggregateDrives(samples: readonly DriveSignals[]): DriveAggregate {
  const keys = ['hunger', 'boredom', 'futility', 'curiosity', 'discomfort'] as const
  const max: DriveSignals = { hunger: 0, boredom: 0, futility: 0, curiosity: 0, discomfort: 0 }
  const sum: DriveSignals = { hunger: 0, boredom: 0, futility: 0, curiosity: 0, discomfort: 0 }

  for (const s of samples) {
    for (const k of keys) {
      max[k] = Math.max(max[k], s[k])
      sum[k] += s[k]
    }
  }

  const n = samples.length
  const avg: DriveSignals = {
    hunger: sum.hunger / n,
    boredom: sum.boredom / n,
    futility: sum.futility / n,
    curiosity: sum.curiosity / n,
    discomfort: sum.discomfort / n,
  }

  const peakFelt: string[] = []
  if (max.futility >= 0.5) peakFelt.push(`futility peaked at ${max.futility.toFixed(2)}`)
  if (max.boredom >= 0.5) peakFelt.push(`boredom peaked at ${max.boredom.toFixed(2)}`)
  if (max.hunger >= 0.5) peakFelt.push(`hunger peaked at ${max.hunger.toFixed(2)}`)
  if (max.discomfort >= 0.5) peakFelt.push(`discomfort peaked at ${max.discomfort.toFixed(2)}`)

  return { samples: n, max, avg, peakFelt }
}

function formatRunSummary(metrics: MetricsSummary, drives?: DriveAggregate): string {
  const mins = Math.floor(metrics.runDurationSec / 60)
  const secs = metrics.runDurationSec % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  const lines: string[] = []
  lines.push(`========== RUN SUMMARY (${metrics.agentId}) ==========`)
  lines.push(`total time:  ${timeStr} (${metrics.runDurationSec}s)`)
  lines.push(`total cost:  $${metrics.totalCostUsd.toFixed(5)}`)
  lines.push(`total calls: ${metrics.totalCalls}`)
  for (const [caller, st] of Object.entries(metrics.stages)) {
    lines.push(`  ${caller} (${st.model}):`)
    lines.push(
      `    ${st.calls} calls | avg ${st.avgLatencyMs}ms | ` +
        `in ${st.inputTokens} / out ${st.outputTokens} tok | $${st.costUsd.toFixed(5)}`
    )
  }
  if (drives) {
    lines.push(`  drives (${drives.samples} ticks, no LLM cost):`)
    lines.push(
      `    avg hunger ${drives.avg.hunger.toFixed(2)} | boredom ${drives.avg.boredom.toFixed(2)} | ` +
        `futility ${drives.avg.futility.toFixed(2)} | curiosity ${drives.avg.curiosity.toFixed(2)} | ` +
        `discomfort ${drives.avg.discomfort.toFixed(2)}`
    )
    lines.push(
      `    max hunger ${drives.max.hunger.toFixed(2)} | boredom ${drives.max.boredom.toFixed(2)} | ` +
        `futility ${drives.max.futility.toFixed(2)} | curiosity ${drives.max.curiosity.toFixed(2)} | ` +
        `discomfort ${drives.max.discomfort.toFixed(2)}`
    )
    if (drives.peakFelt.length > 0) {
      lines.push(`    peaks: ${drives.peakFelt.join('; ')}`)
    }
  }
  lines.push('===============================================')
  return lines.join('\n')
}
