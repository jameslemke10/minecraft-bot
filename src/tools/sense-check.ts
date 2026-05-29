/**
 * End-to-end sanity check for the shared general body. Connects, senses once,
 * prints the rendered percept + the diamond task's progress read, disconnects.
 * Viewer disabled to avoid port conflicts. Run: pnpm sense:check
 */
import 'dotenv/config'
import { createGeneralBody, renderPercept } from '../body/minecraft/general/index.js'
import { diamondTask } from '../task/diamond.js'

async function main(): Promise<void> {
  const body = await createGeneralBody({
    username: process.env.PROBE_NAME ?? 'SenseCheck',
    viewer: { enabled: false, thirdPersonPort: 3090, firstPersonPort: 3091 },
  })

  const percept = await body.sense()

  console.log('\n================ RENDERED PERCEPT (what the LLM sees) ================\n')
  console.log(renderPercept(percept))

  console.log('\n================ TASK READ ================\n')
  console.log('goal:', diamondTask.goal)
  console.log('complete:', diamondTask.isComplete(percept))
  console.log('progress:', JSON.stringify(diamondTask.progress(percept)))

  console.log('\n================ STRUCTURED (counts) ================\n')
  console.log('standing_on:', percept.surroundings.standing_on?.name ?? 'nothing')
  console.log('near blocks:', percept.surroundings.near.length)
  console.log('notable blocks:', percept.surroundings.notable.length)
  console.log('entities:', percept.entities.length)
  console.log('inventory items:', percept.self.inventory.length)

  body.disconnect()
  setTimeout(() => process.exit(0), 500)
}

main().catch((err: unknown) => {
  console.error('sense-check failed:', err)
  process.exit(1)
})
