/** Shared general Minecraft body for the context-management experiment. */
export { createGeneralBody, type GeneralBodyOptions } from './body.js'
export { ACTION_DOCS, ActionSchema, type Action, type ActionKind } from './actions.js'
export { renderPercept } from './render.js'
export type {
  Percept,
  SelfPercept,
  WorldFacts,
  Surroundings,
  BlockAt,
  EntityPercept,
  WorldEvent,
  InventoryItem,
} from './percept.js'
