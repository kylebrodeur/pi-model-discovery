import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type {
  ModelDiscoveryConfig,
} from './types';

export const formatModelRef = (ref: string | undefined): string => {
  return ref ?? 'none';
};

export const updateStatus = (
  ctx: ExtensionContext,
  enabled: boolean,
  selectedProfile: string,
  widgetEnabled: boolean,
  currentConfig: ModelDiscoveryConfig,
) => {
  const statusText = `discovery:${selectedProfile}`;
  ctx.ui.setStatus('discovery', ctx.ui.theme.fg('dim', statusText));

  if (!widgetEnabled) {
    ctx.ui.setWidget('discovery', undefined);
    return;
  }

  const widgetLines = [
    `Discovery: ${enabled ? 'enabled' : 'disabled'}`,
    `Profile: ${selectedProfile}`,
  ];

  ctx.ui.setWidget(
    'discovery',
    widgetLines.map((line) => ctx.ui.theme.fg('dim', line)),
  );
};
