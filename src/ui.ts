import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

export const updateStatus = (
  ctx: ExtensionContext,
  enabled: boolean,
) => {
  ctx.ui.setStatus('discovery', ctx.ui.theme.fg('dim', `discovery:${enabled ? 'on' : 'off'}`));
  ctx.ui.setWidget('discovery', undefined);
};
