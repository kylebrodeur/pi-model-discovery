import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryState } from './types';

export interface ModelSnapshot {
  ref: string;
  id: string;
  name: string;
  contextWindow: number;
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

export interface WidgetData {
  current: ModelSnapshot | null;
  totalRegistered: number;
  thinkingLevel: string | null;
}

const formatContext = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};

const dot = (theme: any, on: boolean, label: string): string =>
  theme.fg(on ? 'success' : 'dim', `${on ? '●' : '○'}`) + theme.fg(on ? 'success' : 'dim', label);

/** Compact single-line widget. */
const renderWidget = (theme: any, data: WidgetData): string[] => {
  const { current, totalRegistered, thinkingLevel } = data;

  if (!current) {
    return [theme.fg('muted', `○ no model · ${totalRegistered} ollama`)];
  }

  // Left: ◆ model-name · family · size · quant
  const meta: string[] = [];
  if (current.family) meta.push(current.family);
  if (current.parameterSize) meta.push(current.parameterSize);
  if (current.quantization) meta.push(current.quantization);
  const left = [
    theme.fg('accent', '◆'),
    theme.fg('accent', current.name),
    meta.length ? theme.fg('muted', `· ${meta.join(' · ')}`) : '',
  ].filter(Boolean).join(' ');

  // Middle: ctx · thinking
  const middle: string[] = [
    theme.fg('muted', `ctx ${formatContext(current.contextWindow)}`),
  ];
  if (thinkingLevel && current.reasoning) {
    middle.push(theme.fg('accent', `think ${thinkingLevel}`));
  } else if (thinkingLevel) {
    middle.push(theme.fg('muted', `think ${thinkingLevel}`));
  }

  // Right: capability dots (only show on-state)
  const caps: string[] = [];
  if (current.vision) caps.push(theme.fg('success', '●vis'));
  if (current.reasoning) caps.push(theme.fg('success', '●thi'));
  if (current.tools) caps.push(theme.fg('success', '●tls'));

  const parts = [
    left,
    middle.join(theme.fg('muted', ' · ')),
    caps.length ? caps.join(' ') : theme.fg('dim', '○ no caps'),
  ];

  return [parts.filter(Boolean).join('   ')];
};

export const updateWidget = (ctx: ExtensionContext, data: WidgetData): void => {
  ctx.ui.setWidget(
    'providers',
    (_tui: unknown, theme: any) => ({
      render: (_width: number) => renderWidget(theme, data),
      invalidate: () => {},
    }),
    { placement: 'belowEditor' },
  );
};

export const clearWidget = (ctx: ExtensionContext): void => {
  ctx.ui.setWidget('providers', undefined);
};

export const snapshotFromState = (
  ref: string,
  state: ModelDiscoveryState,
): ModelSnapshot | null => {
  const slash = ref.indexOf('/');
  if (slash < 0) return null;
  const provider = ref.slice(0, slash);
  const id = ref.slice(slash + 1);
  if (provider !== 'ollama') return null;

  const ollama = state.lastSync?.ollama;
  if (!ollama) return null;
  if (!ollama.modelIds.includes(id)) return null;

  return {
    ref,
    id,
    name: id,
    contextWindow: ollama.contextWindows[id] ?? 0,
    vision: ollama.vision.includes(id),
    reasoning: ollama.reasoning.includes(id),
    tools: ollama.tools.includes(id),
    family: ollama.families[id],
    parameterSize: ollama.parameterSizes[id],
    quantization: ollama.quantizations[id],
  };
};
