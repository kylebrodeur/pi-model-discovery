import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { buildStatus, type StatusData } from './widget';

export const updateStatus = (
  ctx: ExtensionContext,
  data: StatusData,
  enabled: boolean,
  showCapLabelText: boolean = false,
  showLocationLabels: boolean = false,
): void => {
  if (!enabled) {
    ctx.ui.setStatus('z-providers', undefined);
    ctx.ui.setWidget('providers', undefined);
    return;
  }
  const text = buildStatus(ctx.ui.theme, data, showCapLabelText, showLocationLabels);
  // Use setStatus with a key that sorts last alphabetically to appear on the right
  // of the footer. Use a truncated version to avoid the terminal-width crash.
  const maxLen = 200; // safe upper bound; pi truncates further if needed
  const truncated = text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
  ctx.ui.setStatus('z-providers', truncated);
  // Clear the widget since we're using setStatus now
  ctx.ui.setWidget('providers', undefined);
};

export const clearStatus = (ctx: ExtensionContext): void => {
  ctx.ui.setStatus('z-providers', undefined);
  ctx.ui.setWidget('providers', undefined);
};
