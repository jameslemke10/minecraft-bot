/** Result of body.execute — fed back into WM so the brain sees failures. */
export interface ActionResult {
  ok: boolean
  message: string
}

export const actionOk = (message = 'ok'): ActionResult => ({ ok: true, message })
export const actionFail = (message: string): ActionResult => ({ ok: false, message })
