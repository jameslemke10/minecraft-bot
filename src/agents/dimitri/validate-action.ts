import type { ZodError } from 'zod'
import { ActionSchema, type Action } from '../../body/minecraft/general/index.js'
import { logger } from '../../logger.js'

export interface ActionAttempt {
  action: Action | null
  /** Kind from the model (for outcome logging when validation fails). */
  attemptedKind: string
  /** Human-readable rejection reason surfaced to WM/history. */
  error?: string
}

/** Parse and validate an executive action; never fail silently. */
export function validateExecutiveAction(
  raw: { kind: string; args: Record<string, unknown> } | undefined,
  verbs: readonly string[],
  tick: number
): ActionAttempt {
  if (!raw?.kind) {
    return { action: null, attemptedKind: 'none', error: 'no action in model response' }
  }

  if (verbs.length > 0 && !verbs.includes(raw.kind)) {
    const error = `${raw.kind} rejected: not in available verbs (${verbs.join(', ')})`
    logger.warn({ tick, kind: raw.kind, verbs }, 'executive chose a verb not in play — rejecting')
    return { action: null, attemptedKind: raw.kind, error }
  }

  const args: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw.args ?? {})) {
    if (v !== null && v !== undefined) args[k] = v
  }

  const parsed = ActionSchema.safeParse({ kind: raw.kind, args })
  if (!parsed.success) {
    const error = formatActionRejection(raw.kind, parsed.error)
    logger.warn({ tick, raw, issues: parsed.error.issues }, 'executive returned invalid action')
    return { action: null, attemptedKind: raw.kind, error }
  }

  return { action: parsed.data, attemptedKind: parsed.data.kind }
}

function formatActionRejection(kind: string, err: ZodError): string {
  const missing = err.issues
    .filter((i) => i.code === 'invalid_type' || i.code === 'too_small')
    .map((i) => i.path.join('.'))
    .filter(Boolean)

  if (kind === 'place') {
    const needBlock = missing.includes('args.block') || err.issues.some((i) => i.path.includes('block'))
    if (needBlock || !missing.length) {
      return 'place rejected: missing required arg "block" (exact inventory item name, e.g. crafting_table) plus x, y, z'
    }
  }

  if (kind === 'move' && missing.some((p) => p.includes('z') || p.includes('x'))) {
    return 'move rejected: requires args x and z; optional y for target height'
  }

  const detail = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  return `${kind} rejected: ${detail || 'invalid args'}`
}
