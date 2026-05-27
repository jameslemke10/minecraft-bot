import { GoogleGenAI } from '@google/genai'
import { config } from '../config.js'
import { logger } from '../logger.js'

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
  /** System-level identity / instruction prompt. */
  system: string
  /** Per-call user-facing prompt content. */
  user: string
}

export interface CompleteResult {
  text: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

/**
 * One-shot text completion. Returns plain text. Retries on transient errors
 * (rate limits, 5xx) with exponential backoff. All calls log token usage +
 * latency so cost stays observable from day one.
 */
export async function complete(opts: CompleteOpts): Promise<CompleteResult> {
  const start = Date.now()
  let lastErr: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await getClient().models.generateContent({
        model: config.gemini.model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
        },
      })

      const text = resp.text ?? ''
      const usage = resp.usageMetadata
      const result: CompleteResult = {
        text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - start,
      }

      logger.info(
        {
          caller: opts.caller,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
        },
        'gemini call'
      )

      return result
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt
      logger.warn(
        { caller: opts.caller, attempt: attempt + 1, backoffMs: backoff, err: String(err) },
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
