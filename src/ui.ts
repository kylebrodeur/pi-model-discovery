import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

export const updateStatus = (
  ctx: ExtensionContext,
  _enabled: boolean,
) => {
  ctx.ui.setStatus('providers', ctx.ui.theme.fg('dim', 'providers'));
};
