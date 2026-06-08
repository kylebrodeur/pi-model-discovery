import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
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

export interface StatusData {
  current: ModelSnapshot | null;
  totalRegistered: number;
  thinkingLevel: string | null;
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

/** Single-line footer status. Only shows what pi doesn't already display. */
export const buildStatus = (theme: any, data: StatusData, showCapLabels: boolean = true): string => {
  const { current } = data;
  if (!current) return '';

  // Capability icons (dim when off, success when on)
  const cap = (icon: string, on: boolean): string =>
    on ? theme.fg('success', icon) : theme.fg('dim', icon);
  const capIcons = [
    cap('◉', current.vision),      // eye / vision
    cap('◆', current.reasoning),   // diamond / thinking
    cap('⏵', current.tools),       // play / tools
  ].join(' ');

  // Stats: parameter size, context window, disk size, then variant
  const statParts: string[] = [];
  if (current.parameterSize) {
    statParts.push(theme.fg('muted', `◫:${current.parameterSize}`));
  }
  if (current.contextWindow > 0) {
    statParts.push(theme.fg('muted', `▣:${formatContext(current.contextWindow)}`));
  }
  // For local models, disk size; for cloud models, cloud icon
  if (current.size && !current.remote) {
    statParts.push(theme.fg('dim', `◧:${formatSize(current.size)}`));
  } else if (current.remote) {
    statParts.push(theme.fg('accent', '☁'));
  }
  if (current.qat) statParts.push(theme.fg('success', '⚡'));
  if (current.embedding) statParts.push(theme.fg('muted', '◇'));

  // Assemble: caps section then stats, with pipe separators and consistent spacing
  const sep = theme.fg('dim', '|');
  const capsSection = showCapLabels ? `${theme.fg('muted', 'Caps:')} ${capIcons}` : capIcons;
  return [capsSection, ...statParts].join(` ${sep} `);
};

/** Multi-line model card content for the popup. */
export const buildModelCard = (theme: any, snapshot: ModelSnapshot, ollama: ModelDiscoveryState['lastSync'] extends infer T ? T extends { ollama?: infer O } ? O : never : never): string => {
  if (!ollama) return '';
  const lines: string[] = [];
  const o = ollama as any;

  const name = snapshot.name;
  const tags: string[] = [];
  if (snapshot.remote) tags.push('☁ cloud');
  if (snapshot.qat) tags.push('⚡ QAT');
  if (snapshot.embedding) tags.push('◇ embed');

  lines.push(`${theme.fg('accent', name)}${tags.length ? ' ' + theme.fg('muted', tags.join(' ')) : ''}`);

  const meta: string[] = [];
  if (snapshot.family) meta.push(snapshot.family);
  if (snapshot.parameterSize) meta.push(snapshot.parameterSize);
  if (snapshot.quantization) meta.push(snapshot.quantization);
  if (snapshot.format && snapshot.format !== 'gguf') meta.push(snapshot.format);
  if (meta.length) {
    lines.push(theme.fg('muted', meta.join(' · ')));
  }

  lines.push('');
  lines.push(`${theme.fg('muted', 'context')}     ${snapshot.contextWindow > 0 ? formatContext(snapshot.contextWindow) : '?'}${snapshot.contextWindow ? ' tokens' : ''}`);
  if (snapshot.size) {
    lines.push(`${theme.fg('muted', 'size')}        ${formatSize(snapshot.size)}${snapshot.remote ? ' (remote)' : ' on disk'}`);
  }
  if (snapshot.digest) {
    lines.push(`${theme.fg('muted', 'digest')}      ${snapshot.digest.slice(0, 12)}`);
  }
  if (snapshot.modifiedAt && !snapshot.remote) {
    lines.push(`${theme.fg('muted', 'modified')}    ${relativeTime(snapshot.modifiedAt)} ago`);
  }

  lines.push('');
  const cap = (label: string, on: boolean) => on
    ? theme.fg('success', `● ${label}`)
    : theme.fg('dim', `○ ${label}`);
  lines.push(`${cap('vision', snapshot.vision)}   ${cap('thinking', snapshot.reasoning)}   ${cap('tools', snapshot.tools)}   ${snapshot.embedding ? theme.fg('success', '● embedding') : ''}`);

  return lines.join('\n');
};

export const updateStatus = (ctx: ExtensionContext, data: StatusData, enabled: boolean): void => {
  if (!enabled) {
    ctx.ui.setStatus('providers', undefined);
    return;
  }
  const text = buildStatus(ctx.ui.theme, data);
  ctx.ui.setStatus('providers', text);
};

export const clearStatus = (ctx: ExtensionContext): void => {
  ctx.ui.setStatus('providers', undefined);
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

/** Build the full model card text (used by /providers card and shortcut). */
export const buildCard = (theme: any, snapshot: ModelSnapshot | null, state: ModelDiscoveryState): string => {
  if (!snapshot) return theme.fg('muted', 'No model selected.');
  return buildModelCard(theme, snapshot, state.lastSync?.ollama as any);
};
