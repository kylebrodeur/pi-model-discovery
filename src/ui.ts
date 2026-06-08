import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { buildStatus, type StatusData } from './widget';

export const updateStatus = (
  ctx: ExtensionContext,
  data: StatusData,
  enabled: boolean,
  showCapLabelText: boolean = false,
  showLocationLabels: boolean = false,
): void => {
  if (!enabled) {
    ctx.ui.setWidget('providers', undefined);
    return;
  }
  const text = buildStatus(ctx.ui.theme, data, showCapLabelText, showLocationLabels);
  ctx.ui.setWidget(
    'providers',
    (_tui, _theme) => ({
      render: (width: number) => text ? [truncateToWidth(text, width)] : [],
      invalidate: () => {},
    }),
    { placement: 'belowEditor' },
  );
};

export const clearStatus = (ctx: ExtensionContext): void => {
  ctx.ui.setWidget('providers', undefined);
};
