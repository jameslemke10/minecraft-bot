import 'dotenv/config'
import { z } from 'zod'

const ConfigSchema = z.object({
  mc: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().int().positive().default(25565),
    version: z.string().default('1.20.4'),
  }),
  gemini: z.object({
    apiKey: z.string().optional(),
    // Default model used when a caller doesn't specify one.
    model: z.string().default('gemini-2.5-flash-lite'),
    // Fast/cheap model — used by Thalamus (attention filtering).
    modelFast: z.string().default('gemini-2.5-flash-lite'),
    // More thoughtful, slower model — used by PFC (deliberation).
    modelDeliberate: z.string().default('gemini-2.5-flash'),
  }),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  viewer: z.object({
    enabled: z.coerce.boolean().default(true),
  }),
})

export type Config = z.infer<typeof ConfigSchema>

export const config: Config = ConfigSchema.parse({
  mc: {
    host: process.env.MC_HOST,
    port: process.env.MC_PORT,
    version: process.env.MC_VERSION,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    modelFast: process.env.GEMINI_MODEL_FAST,
    modelDeliberate: process.env.GEMINI_MODEL_DELIBERATE,
  },
  logLevel: process.env.LOG_LEVEL,
  viewer: {
    enabled: process.env.VIEWER_ENABLED ?? true,
  },
})
