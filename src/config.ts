import 'dotenv/config'
import { z } from 'zod'

const ConfigSchema = z.object({
  mc: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().int().positive().default(25565),
    version: z.string().default('1.20.4'),
    username: z.string().default('ClaudeBot'),
  }),
  gemini: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gemini-2.5-flash-lite'),
  }),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  viewer: z.object({
    enabled: z.coerce.boolean().default(true),
    thirdPersonPort: z.coerce.number().int().positive().default(3000),
    firstPersonPort: z.coerce.number().int().positive().default(3001),
  }),
})

export type Config = z.infer<typeof ConfigSchema>

export const config: Config = ConfigSchema.parse({
  mc: {
    host: process.env.MC_HOST,
    port: process.env.MC_PORT,
    version: process.env.MC_VERSION,
    username: process.env.MC_USERNAME,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
  },
  logLevel: process.env.LOG_LEVEL,
  viewer: {
    enabled: process.env.VIEWER_ENABLED ?? true,
    thirdPersonPort: process.env.VIEWER_THIRD_PERSON_PORT,
    firstPersonPort: process.env.VIEWER_FIRST_PERSON_PORT,
  },
})
