import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
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
  syncedAt?: number;
}

export interface WidgetData {
  current: ModelSnapshot | null;
  totalRegistered: number;
  thinkingLevel: string | null;
  /** 'rich' (default, two lines) or 'minimal' (one line) or false (hidden). */
  showWidget?: boolean | 'rich' | 'minimal';
  /** When the last sync ran, for freshness display. */
  syncedAt?: number;
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
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 2592000)}mo`;
};

const relativeSince = (ts: number): string => {
  if (!ts) return '';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

/** Compact one-line for the "minimal" mode. */
const buildMinimal = (theme: any, current: ModelSnapshot, ctx2: number, thinking: string | null, total: number): string => {
  const bits: string[] = [
    theme.fg('accent', '◈ '),
    theme.fg('accent', current.name),
  ];
  if (ctx2 > 0) bits.push(theme.fg('muted', `· ctx ${formatContext(ctx2)}`));
  if (thinking && current.reasoning) bits.push(theme.fg('warning', `· ${thinking}`));
  bits.push(theme.fg('dim', `· ${total} ollama`));
  return bits.join(' ');
};

/** Rich two-line widget. */
const buildRich = (
  theme: any,
  current: ModelSnapshot,
  total: number,
  thinking: string | null,
  syncedAt: number | undefined,
): string[] => {
  // Line 1: provider · model · family · size · quant · status
  const meta: string[] = [];
  if (current.family) meta.push(current.family);
  if (current.parameterSize) meta.push(current.parameterSize);
  if (current.quantization) meta.push(current.quantization);

  const statusBadges: string[] = [];
  if (current.remote) statusBadges.push(theme.fg('accent', '☁ cloud'));
  if (current.qat) statusBadges.push(theme.fg('success', '⚡ QAT'));
  if (current.embedding) statusBadges.push(theme.fg('muted', '◇ embed'));

  const freshness = syncedAt
    ? theme.fg('dim', `synced ${relativeSince(syncedAt)} ago`)
    : '';
  const totalLine = theme.fg('dim', `· ${total} ollama`);

  const line1 = [
    theme.fg('accent', '◈ '),
    theme.fg('accent', current.name),
    meta.length ? theme.fg('muted', `· ${meta.join(' · ')}`) : '',
    statusBadges.length ? theme.fg('muted', `· ${statusBadges.join(' · ')}`) : '',
    freshness,
    totalLine,
  ].filter(Boolean).join(' ');

  // Line 2: capabilities + context + thinking
  const cap = (label: string, on: boolean): string =>
    on ? theme.fg('success', `● ${label}`) : theme.fg('dim', `○ ${label}`);

  const caps = [
    cap('vision', current.vision),
    cap('thinking', current.reasoning),
    cap('tools', current.tools),
  ].join('   ');

  const ctxStr = current.contextWindow > 0
    ? theme.fg('muted', `ctx ${formatContext(current.contextWindow)}`)
    : '';
  const sizeStr = current.size
    ? theme.fg('muted', `${formatSize(current.size)} on disk`)
    : '';
  const thinkStr = thinking && current.reasoning
    ? theme.fg('warning', `⚡ ${thinking}`)
    : thinking
      ? theme.fg('dim', `think ${thinking}`)
      : '';
  const digestStr = current.digest
    ? theme.fg('dim', shortDigest(current.digest))
    : '';
  const ageStr = current.modifiedAt && !current.remote
    ? theme.fg('dim', `${relativeTime(current.modifiedAt)} old`)
    : '';

  const line2 = [
    caps,
    [ctxStr, sizeStr].filter(Boolean).join(' · '),
    thinkStr,
    [digestStr, ageStr].filter(Boolean).join(' '),
  ].filter(Boolean).join('   ');

  return [line1, line2];
};

const buildWidgetLines = (ctx: ExtensionContext, data: WidgetData): string[] => {
  const { current, totalRegistered, thinkingLevel, showWidget, syncedAt } = data;
  const theme = ctx.ui.theme;
  const mode = showWidget === false ? 'rich' : (showWidget || 'rich');

  if (!current) {
    return [theme.fg('muted', `◈ no model · ${totalRegistered} ollama`)];
  }

  if (mode === 'minimal') {
    return [buildMinimal(theme, current, current.contextWindow, thinkingLevel, totalRegistered)];
  }

  return buildRich(theme, current, totalRegistered, thinkingLevel, syncedAt);
};

export const updateWidget = (ctx: ExtensionContext, data: WidgetData): void => {
  if (data.showWidget === false) {
    ctx.ui.setWidget('providers', undefined);
    return;
  }
  const lines = buildWidgetLines(ctx, data);
  ctx.ui.setWidget(
    'providers',
    (_tui, _theme) => ({
      render: (width: number) => lines.map(line => truncateToWidth(line, width)),
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
  syncedAt?: number,
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
    syncedAt,
  };
};
