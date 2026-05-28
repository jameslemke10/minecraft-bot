import { config } from '../../config.js'
import { BRUTUS_IDENTITY } from './identity.js'
import { agentDataDir, agentWmPath } from '../paths.js'
import type { AgentDefinition } from '../types.js'
import { createMinecraftBody } from './body/minecraft/index.js'
import { runBrainWithDrives } from '../../brain/schedule-brutus.js'

const DATA_DIR = agentDataDir(import.meta.url)

export const brutus: AgentDefinition = {
  id: 'brutus',
  displayName: 'Brutus',
  mcUsername: 'Brutus',
  dataDir: DATA_DIR,
  wmPath: agentWmPath(import.meta.url),
  viewer: { thirdPersonPort: 3010, firstPersonPort: 3011 },
  identity: BRUTUS_IDENTITY,
  brainSchedule: 'drives',
  createBody: () =>
    createMinecraftBody({
      username: 'Brutus',
      viewer: {
        enabled: config.viewer.enabled,
        thirdPersonPort: 3010,
        firstPersonPort: 3011,
      },
    }),
  runBrain: runBrainWithDrives,
}
