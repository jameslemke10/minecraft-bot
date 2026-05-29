/**
 * Dimitri model selection — separate from Atticus/Brutus so the experiment
 * can use stronger Gemini 3.x models without changing global defaults.
 *
 * Override via env:
 *   DIMITRI_MODEL_CURATOR=gemini-3.1-flash-lite
 *   DIMITRI_MODEL_EXECUTIVE=gemini-3.5-flash
 *
 * Curator: 3.1 Flash-Lite — stable, cheap, smarter ref-passing than 2.5-lite.
 * Executive: 3.5 Flash — stable GA agentic model (May 2026); strong tool JSON.
 *
 * Heavier option for executive only: gemini-3.1-pro-preview
 */
export const dimitriModels = {
  curator: process.env.DIMITRI_MODEL_CURATOR ?? 'gemini-3.1-flash-lite',
  executive: process.env.DIMITRI_MODEL_EXECUTIVE ?? 'gemini-3.5-flash',
} as const
