import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { buildStatus, type StatusData } from './widget';

export const updateStatus = (
  ctx: ExtensionContext,
  data: StatusData,
  enabled: boolean,
): void => {
  if (!enabled) {
    ctx.ui.setStatus('providers', undefined);
    return;
  }
  ctx.ui.setStatus('providers', buildStatus(ctx.ui.theme, data));
};

export const clearStatus = (ctx: ExtensionContext): void => {
  ctx.ui.setStatus('providers', undefined);
};
