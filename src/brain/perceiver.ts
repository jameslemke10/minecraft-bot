import type { WorldSnapshot } from './types.js'
import { complete } from '../llm/gemini.js'
import { ATTICUS_IDENTITY } from './identity.js'

/**
 * Atticus's perception: he looks at his current world-snapshot and says what
 * stands out to him in a sentence or two. No actions — this is just seeing.
 */
export async function perceive(snapshot: WorldSnapshot): Promise<string> {
  const result = await complete({
    caller: 'perceiver',
    system: ATTICUS_IDENTITY,
    user: buildPrompt(snapshot),
  })
  return result.text.trim()
}

function buildPrompt(s: WorldSnapshot): string {
  const inv =
    s.inventory.length === 0
      ? 'empty'
      : s.inventory.map((i) => `${i.count}×${i.name}`).join(', ')

  const entities =
    s.nearbyEntities.length === 0
      ? 'none nearby'
      : s.nearbyEntities
          .slice(0, 8)
          .map((e) => `${e.name} (${e.distance.toFixed(1)}m)`)
          .join(', ')

  const events = s.recentEvents.length === 0 ? 'nothing yet' : s.recentEvents.slice(-5).join('; ')

  return `What's happening for you right now? Notice your surroundings.

Your state:
- Position: (${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)})
- Health: ${s.health}/20, Food: ${s.food}/20
- Inventory: ${inv}
- Nearby entities: ${entities}
- Recent events: ${events}

Respond in one or two sentences, first-person, as Atticus. Describe what you notice and what it feels like.`
}
