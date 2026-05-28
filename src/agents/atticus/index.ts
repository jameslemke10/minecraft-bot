import { config } from '../../config.js'
import { ATTICUS_IDENTITY } from './identity.js'
import { agentDataDir, agentWmPath } from '../paths.js'
import type { AgentDefinition } from '../types.js'
import { createMinecraftBody } from './body/minecraft/index.js'
import { runBrain } from '../../brain/schedule.js'

const DATA_DIR = agentDataDir(import.meta.url)

export const atticus: AgentDefinition = {
  id: 'atticus',
  displayName: 'Atticus',
  mcUsername: 'Atticus',
  dataDir: DATA_DIR,
  wmPath: agentWmPath(import.meta.url),
  viewer: { thirdPersonPort: 3000, firstPersonPort: 3001 },
  identity: ATTICUS_IDENTITY,
  brainSchedule: 'baseline',
  createBody: () =>
    createMinecraftBody({
      username: 'Atticus',
      viewer: {
        enabled: config.viewer.enabled,
        thirdPersonPort: 3000,
        firstPersonPort: 3001,
      },
    }),
  runBrain,
}
