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
  embedding: boolean;
  remote: boolean;
  qat: boolean;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  format?: string;
  size?: number;
  digest?: string;
  modifiedAt?: string;
}

export interface WidgetData {
  current: ModelSnapshot | null;
  totalRegistered: number;
  thinkingLevel: string | null;
  showWidget?: boolean;
}

const formatContext = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};

const formatSize = (bytes: number): string => {
  if (bytes <= 0) return '';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)}G`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)}M`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)}K`;
  return String(bytes);
};

const shortDigest = (digest: string): string =>
  digest ? digest.slice(0, 7) : '';

const relativeTime = (iso: string): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
};

/** Compact single-line widget. */
const renderWidget = (theme: any, data: WidgetData): string[] => {
  const { current, totalRegistered, thinkingLevel } = data;

  if (!current) {
    return [theme.fg('muted', `no model · ${totalRegistered} ollama`)];
  }

  // Left: model-name · family · size · quant
  const meta: string[] = [];
  if (current.family) meta.push(current.family);
  if (current.parameterSize) meta.push(current.parameterSize);
  if (current.quantization) meta.push(current.quantization);
  if (current.format && current.format !== 'gguf') meta.push(current.format);

  const tags: string[] = [];
  if (current.remote) tags.push(theme.fg('accent', 'cloud'));
  if (current.qat) tags.push(theme.fg('accent', 'qat'));
  if (current.embedding) tags.push(theme.fg('accent', 'embed'));

  const left = [
    theme.fg('accent', current.name),
    meta.length ? theme.fg('muted', `· ${meta.join(' · ')}`) : '',
    tags.length ? theme.fg('muted', `· ${tags.join(' · ')}`) : '',
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
  if (current.size) {
    middle.push(theme.fg('muted', formatSize(current.size)));
  }

  // Right: capability labels
  const caps: string[] = [];
  if (current.vision) caps.push(theme.fg('muted', 'vision'));
  if (current.reasoning) caps.push(theme.fg('muted', 'thinking'));
  if (current.tools) caps.push(theme.fg('muted', 'tools'));

  // Trailing: digest (truncated) + modified time, when local
  const trail: string[] = [];
  if (current.digest) trail.push(shortDigest(current.digest));
  if (current.modifiedAt && !current.remote) trail.push(relativeTime(current.modifiedAt));

  const parts = [
    left,
    middle.join(theme.fg('muted', ' · ')),
    caps.length ? caps.join(' ') : '',
    trail.length ? theme.fg('dim', trail.join(' ')) : '',
  ];

  return [parts.filter(Boolean).join('   ')];
};

export const updateWidget = (ctx: ExtensionContext, data: WidgetData): void => {
  if (data.showWidget === false) {
    ctx.ui.setWidget('providers', undefined);
    return;
  }
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
    embedding: ollama.embedding?.includes(id) ?? false,
    remote: ollama.remote?.includes(id) ?? false,
    qat: ollama.qat?.includes(id) ?? false,
    family: ollama.families[id],
    parameterSize: ollama.parameterSizes[id],
    quantization: ollama.quantizations[id],
    format: ollama.formats?.[id],
    size: ollama.sizes?.[id],
    digest: ollama.digests?.[id],
    modifiedAt: ollama.modifiedAt?.[id],
  };
};
