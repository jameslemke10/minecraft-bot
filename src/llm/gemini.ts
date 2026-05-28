import { GoogleGenAI, type Schema } from '@google/genai'
import { config } from '../config.js'
import { logger } from '../logger.js'
import type { Metrics } from './metrics.js'
import type { RunLog } from '../agents/run-log.js'

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not set — add it to .env')
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.gemini.apiKey })
  }
  return client
}

export interface CompleteOpts {
  /** Which brain module is calling — used in logs for cost attribution. */
  caller: string
  /** Per-agent metrics sink. Required so costs stay isolated per agent. */
  metrics: Metrics
  /** System-level identity / instruction prompt. */
  system: string
  /** Per-call user-facing prompt content. */
  user: string
  /** Override the default model (defaults to config.gemini.model). */
  model?: string
  /** Optional run log — persists full prompt/response to llm.jsonl. */
  runLog?: RunLog
}

export interface CompleteResult {
  text: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  model: string
}

export interface CompleteJsonOpts<T> extends CompleteOpts {
  /** A Gemini Schema describing the expected JSON shape. */
  schema: Schema
  /** Optional runtime validator — runs after parse, throws on mismatch. */
  validate?: (parsed: unknown) => T
}

export interface CompleteJsonResult<T> extends CompleteResult {
  data: T
}

/**
 * Plain-text completion. Retries on transient errors (rate limits, 5xx).
 * Logs caller, model, tokens, and latency for cost observability.
 */
export async function complete(opts: CompleteOpts): Promise<CompleteResult> {
  const model = opts.model ?? config.gemini.model
  return callGemini({ ...opts, model })
}

/**
 * JSON-structured completion. Forces Gemini into JSON-mode with the given
 * schema, parses the response, and (optionally) runtime-validates it.
 * Returns the parsed `data` alongside the raw text and usage stats.
 */
export async function completeJson<T = unknown>(
  opts: CompleteJsonOpts<T>
): Promise<CompleteJsonResult<T>> {
  const model = opts.model ?? config.gemini.model
  const raw = await callGemini({
    ...opts,
    model,
    responseMimeType: 'application/json',
    responseSchema: opts.schema,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.text)
  } catch (err) {
    logger.error({ caller: opts.caller, text: raw.text.slice(0, 500) }, 'JSON parse failed')
    throw new Error(`completeJson: response was not valid JSON: ${String(err)}`)
  }

  const data = (opts.validate ? opts.validate(parsed) : (parsed as T))
  return { ...raw, data }
}

interface CallOpts extends CompleteOpts {
  model: string
  responseMimeType?: string
  responseSchema?: Schema
}

async function callGemini(opts: CallOpts): Promise<CompleteResult> {
  const start = Date.now()
  let lastErr: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await getClient().models.generateContent({
        model: opts.model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
          ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
        },
      })

      const text = resp.text ?? ''
      const usage = resp.usageMetadata
      const result: CompleteResult = {
        text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - start,
        model: opts.model,
      }

      opts.metrics.record(
        opts.caller,
        opts.model,
        result.inputTokens,
        result.outputTokens,
        result.latencyMs
      )

      opts.runLog?.recordLlm({
        caller: opts.caller,
        model: opts.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        system: opts.system,
        user: opts.user,
        response: text,
      })

      logger.info(
        {
          caller: opts.caller,
          model: opts.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          structured: Boolean(opts.responseSchema),
          prompt: { system: opts.system, user: opts.user },
          response: text,
        },
        'gemini call'
      )

      return result
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt
      logger.warn(
        {
          caller: opts.caller,
          model: opts.model,
          attempt: attempt + 1,
          backoffMs: backoff,
          err: String(err),
        },
        'gemini call failed, retrying'
      )
      await sleep(backoff)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function isRetryable(err: unknown): boolean {
  const msg = String(err)
  return (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('DEADLINE_EXCEEDED')
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
