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

/** A short tag describing what a model is good at, derived from its tags. */
const capabilityTag = (m: ModelSnapshot): string => {
  if (m.vision && m.reasoning) return 'multimodal · reasoning';
  if (m.vision) return 'multimodal';
  if (m.reasoning) return 'reasoning';
  return 'text';
};

const renderWidget = (theme: any, data: WidgetData): string[] => {
  const { current, totalRegistered, thinkingLevel } = data;

  if (!current) {
    return [
      theme.fg('muted', '○ no model selected'),
      theme.fg('muted', `  ${totalRegistered} ollama models registered`),
    ];
  }

  const cap = (label: string, on: boolean): string =>
    theme.fg(on ? 'success' : 'dim', `${on ? '●' : '○'} ${label}`);

  const caps = [
    cap('vision', current.vision),
    cap('thinking', current.reasoning),
    cap('tools', current.tools),
  ].join('   ');

  // Line 1: model name + family + size + quantization
  const meta: string[] = [];
  if (current.family) meta.push(current.family);
  if (current.parameterSize) meta.push(current.parameterSize);
  if (current.quantization) meta.push(current.quantization);
  const metaText = meta.length ? theme.fg('muted', `  ·  ${meta.join(' · ')}`) : '';

  // Line 2: context + thinking + tag
  const ctxText = `ctx: ${formatContext(current.contextWindow)}`;
  const thinkText = thinkingLevel
    ? theme.fg('accent', `   thinking: ${thinkingLevel}`)
    : '';
  const tagText = theme.fg('muted', `   ·   ${capabilityTag(current)}`);

  return [
    `${theme.fg('accent', '◆ ')}${theme.fg('accent', current.name)}${metaText}`,
    `${theme.fg('muted', ctxText)}${thinkText}${tagText}`,
    caps,
  ];
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
