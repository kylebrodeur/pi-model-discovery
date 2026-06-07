import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

export const updateStatus = (
  ctx: ExtensionContext,
  totalRegistered: number,
  reachable: boolean,
) => {
  const dot = reachable
    ? ctx.ui.theme.fg('success', '●')
    : ctx.ui.theme.fg('error', '○');
  const label = totalRegistered > 0
    ? `${dot} ${totalRegistered} ollama`
    : `${dot} ollama`;
  ctx.ui.setStatus('providers', label);
};
