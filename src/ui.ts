import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

export const updateStatus = (
  _ctx: ExtensionContext,
  _totalRegistered: number,
  _reachable: boolean,
): void => {
  // Status bar intentionally empty. The below-editor widget carries
  // model info and the registered count when no model is selected.
};

export const clearStatus = (ctx: ExtensionContext): void => {
  ctx.ui.setStatus('providers', undefined);
};
