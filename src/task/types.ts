import type { Percept } from '../body/minecraft/general/index.js'

/**
 * A Task is the ONLY task-specific piece of the experiment. The body and both
 * brain arms are general; swap the Task to run a different experiment.
 *
 * - `goal` is the natural-language objective injected into prompts.
 * - `isComplete` decides when the run is done.
 * - `progress` produces a monotonic score for the progress charts. There is
 *   no universal progress metric — each task defines its own.
 */
export interface TaskProgress {
  /** Monotonic score (higher = further along). */
  score: number
  /** Human-readable label for the current milestone. */
  label: string
  /** Max possible score, for normalizing charts. */
  max: number
}

export interface Task {
  id: string
  goal: string
  isComplete(percept: Percept): boolean
  progress(percept: Percept): TaskProgress
}
