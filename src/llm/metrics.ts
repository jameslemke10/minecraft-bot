/**
 * Per-run accounting for Gemini calls: token counts, latency, and cost.
 *
 * Pricing is per 1M tokens, paid-tier, as published by Google for the
 * Gemini 2.5 family (input / output):
 *   - gemini-2.5-flash-lite : $0.10 / $0.40
 *   - gemini-2.5-flash      : $0.30 / $2.50
 *   - gemini-2.5-pro        : $1.25 / $10.00
 * Update PRICING if the models or rates change.
 */

interface Price {
  inPerM: number
  outPerM: number
}

const PRICING: Record<string, Price> = {
  'gemini-2.5-flash-lite': { inPerM: 0.1, outPerM: 0.4 },
  'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5 },
  'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10.0 },
}

interface StageStats {
  calls: number
  inputTokens: number
  outputTokens: number
  totalLatencyMs: number
  costUsd: number
  model: string
}

export interface MetricsSummary {
  runDurationSec: number
  totalCostUsd: number
  totalCalls: number
  stages: Record<
    string,
    {
      model: string
      calls: number
      avgLatencyMs: number
      inputTokens: number
      outputTokens: number
      costUsd: number
    }
  >
}

class Metrics {
  private startedAt = Date.now()
  private byStage = new Map<string, StageStats>()
  private unknownModelsWarned = new Set<string>()

  record(
    caller: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number
  ): void {
    const price = PRICING[model]
    if (!price && !this.unknownModelsWarned.has(model)) {
      this.unknownModelsWarned.add(model)
      // Avoid importing logger (circular-ish); cost just counts as 0.
      // eslint-disable-next-line no-console
      console.warn(`[metrics] no pricing for model "${model}" — counting cost as $0`)
    }
    const cost = price
      ? (inputTokens / 1e6) * price.inPerM + (outputTokens / 1e6) * price.outPerM
      : 0

    const s = this.byStage.get(caller) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalLatencyMs: 0,
      costUsd: 0,
      model,
    }
    s.calls += 1
    s.inputTokens += inputTokens
    s.outputTokens += outputTokens
    s.totalLatencyMs += latencyMs
    s.costUsd += cost
    s.model = model
    this.byStage.set(caller, s)
  }

  private printed = false

  /**
   * Print the summary synchronously to stderr, exactly once. Safe to call
   * from multiple signal/exit handlers — only the first call prints. Uses a
   * synchronous stderr write so it survives a force-kill (e.g. `tsx watch`).
   */
  printSummaryOnce(): void {
    if (this.printed) return
    this.printed = true
    process.stderr.write('\n' + this.formatSummaryText() + '\n')
  }

  /** Human-readable multi-line summary for synchronous console output. */
  formatSummaryText(): string {
    const s = this.summary()
    const mins = Math.floor(s.runDurationSec / 60)
    const secs = s.runDurationSec % 60
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
    const lines: string[] = []
    lines.push('========== RUN SUMMARY ==========')
    lines.push(`total time:  ${timeStr} (${s.runDurationSec}s)`)
    lines.push(`total cost:  $${s.totalCostUsd.toFixed(5)}`)
    lines.push(`total calls: ${s.totalCalls}`)
    for (const [caller, st] of Object.entries(s.stages)) {
      lines.push(`  ${caller} (${st.model}):`)
      lines.push(
        `    ${st.calls} calls | avg ${st.avgLatencyMs}ms | ` +
          `in ${st.inputTokens} / out ${st.outputTokens} tok | $${st.costUsd.toFixed(5)}`
      )
    }
    lines.push('=================================')
    return lines.join('\n')
  }

  summary(): MetricsSummary {
    const stages: MetricsSummary['stages'] = {}
    let totalCostUsd = 0
    let totalCalls = 0
    for (const [caller, s] of this.byStage) {
      stages[caller] = {
        model: s.model,
        calls: s.calls,
        avgLatencyMs: Math.round(s.totalLatencyMs / s.calls),
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        costUsd: round5(s.costUsd),
      }
      totalCostUsd += s.costUsd
      totalCalls += s.calls
    }
    return {
      runDurationSec: Math.round((Date.now() - this.startedAt) / 1000),
      totalCostUsd: round5(totalCostUsd),
      totalCalls,
      stages,
    }
  }
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

export const metrics = new Metrics()
