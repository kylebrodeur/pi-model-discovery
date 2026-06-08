import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import type { ModelDiscoveryConfig, ModelDiscoveryState } from './types';
import { FALLBACK_CONFIG, mergeConfig, parseConfigFile } from './config';
import { performSync } from './sync';
import { buildCard, snapshotFromState, type ModelSnapshot } from './widget';

export const registerCommands = (
  pi: ExtensionAPI,
  state: {
    readonly currentConfig: ModelDiscoveryConfig;
    enabled: boolean;
    debugEnabled: boolean;
    lastSync: ModelDiscoveryState['lastSync'];
    currentModelRef: string | null;
  },
  actions: {
    persistState: () => void;
    updateStatus: (ctx: ExtensionContext) => void;
    reloadConfig: (ctx?: ExtensionContext, options?: { preserveDebug?: boolean }) => void;
    persistLastSync: (lastSync: ModelDiscoveryState['lastSync']) => void;
    setShowFooterStatus: (on: boolean) => void;
    setShowCapLabelText: (on: boolean) => void;
    setShowLocationLabels: (on: boolean) => void;
    refreshStatus: () => void;
    getCurrentConfig: () => ModelDiscoveryConfig;
  },
) => {
  const SUBCOMMAND_DETAILS = [
    { name: 'status', desc: 'Show sync status and registered models' },
    { name: 'sync', desc: 'Sync local providers into pi configuration' },
    { name: 'info', desc: 'Show details for a specific model' },
    { name: 'card', desc: 'Open the model card popup for the current model' },
    { name: 'footer', desc: 'Toggle the footer status indicator' },
    { name: 'labels', desc: 'Toggle all labels in the footer (cap + location) at once' },
    { name: 'caps', desc: 'Toggle capability labels (vision/thinking/tools) in the footer' },
    { name: 'location', desc: 'Toggle location labels (cloud/QAT/embed) in the footer' },
    { name: 'debug', desc: 'Toggle debug logging' },
    { name: 'reload', desc: 'Reload configuration' },
    { name: 'init', desc: 'Create default config file' },
    { name: 'help', desc: 'Show help' },
  ];

  const getSubcommandCompletions = (prefix: string): AutocompleteItem[] | null => {
    const items = SUBCOMMAND_DETAILS.filter((s) => s.name.startsWith(prefix)).map((s) => ({
      value: s.name, label: s.name, description: s.desc,
    }));
    return items.length > 0 ? items : null;
  };

  const getCurrentSnapshot = (): ModelSnapshot | null => {
    if (!state.currentModelRef) return null;
    return snapshotFromState(state.currentModelRef, {
      enabled: state.enabled,
      debugEnabled: state.debugEnabled,
      lastSync: state.lastSync,
      timestamp: 0,
    });
  };

  const openCard = async (ctx: ExtensionContext, snapshot: ModelSnapshot | null) => {
    if (!snapshot) {
      ctx.ui.notify('No model selected.', 'warning');
      return;
    }
    const text = buildCard(ctx.ui.theme, snapshot, {
      enabled: state.enabled,
      debugEnabled: state.debugEnabled,
      lastSync: state.lastSync,
      timestamp: 0,
    });
    // Use notify (non-blocking, no cursor) instead of editor (which puts a cursor)
    ctx.ui.notify(text, 'info');
  };

  const handleStatus = async (_args: string[], ctx: ExtensionContext) => {
    const ollamaCfg = state.currentConfig.providers?.ollama;
    const ollamaEnabled = ollamaCfg?.enabled !== false;
    const ollamaBaseUrl = ollamaCfg?.baseUrl ?? 'http://127.0.0.1:11434';

    const lines = [
      `Local Providers Status:`,
      `Sync on startup: ${state.currentConfig.syncOnStartup ? 'yes' : 'no'}`,
      `Add to scope: ${state.currentConfig.addToScope ? 'yes' : 'no'}`,
      `Cleanup stale: ${ollamaCfg?.cleanupStale ? 'yes' : 'no'}`,
      `Footer status: ${state.currentConfig.showFooterStatus !== false ? 'on' : 'off'}`,
      `Cap labels: ${state.currentConfig.showCapLabelText === true ? 'on' : 'off'}`,
      `Location labels: ${state.currentConfig.showLocationLabels === true ? 'on' : 'off'}`,
      `Debug: ${state.debugEnabled ? 'on' : 'off'}`,
      ``,
      `Providers:`,
      `  ollama: ${ollamaEnabled ? `watching (${ollamaBaseUrl})` : 'disabled'}`,
    ];

    if (state.lastSync?.ollama) {
      const o = state.lastSync.ollama;
      lines.push(``, `Registered Ollama models: ${o.modelIds.length}`);
      const capParts: string[] = [];
      if (o.vision.length > 0) capParts.push(`${o.vision.length} vision`);
      if (o.reasoning.length > 0) capParts.push(`${o.reasoning.length} reasoning`);
      if (o.tools.length > 0) capParts.push(`${o.tools.length} tools`);
      if (capParts.length > 0) lines.push(`  ${capParts.join(' | ')}`);
      const textOnly = o.modelIds.filter(id => !o.vision.includes(id) && !o.reasoning.includes(id) && !o.tools.includes(id));
      if (textOnly.length > 0) lines.push(`  text-only: ${textOnly.length}`);
    } else {
      lines.push(``, `No sync has run yet this session.`);
    }

    ctx.ui.notify(lines.join('\n'), 'info');
    actions.updateStatus(ctx);
  };

  const handleInfo = async (args: string[], ctx: ExtensionContext) => {
    const modelId = args[0];
    const ollama = state.lastSync?.ollama;
    if (!ollama) {
      ctx.ui.notify('No sync has run yet this session.', 'warning');
      return;
    }
    let id: string | undefined;
    if (modelId) {
      id = ollama.modelIds.find(
        (m) => m === modelId || m.includes(modelId),
      );
    } else {
      // Default: current model
      const ref = state.currentModelRef;
      if (ref) {
        const slash = ref.indexOf('/');
        id = slash >= 0 ? ref.slice(slash + 1) : ref;
      }
    }
    if (!id) {
      ctx.ui.notify(modelId
        ? `Model "${modelId}" not found. Try /providers status.`
        : 'No current model. Use /providers info <model>.', 'error');
      return;
    }
    const snapshot = snapshotFromState(`ollama/${id}`, {
      enabled: state.enabled,
      debugEnabled: state.debugEnabled,
      lastSync: state.lastSync,
      timestamp: 0,
    });
    if (!snapshot) {
      ctx.ui.notify(`Model "${id}" not found.`, 'error');
      return;
    }
    const text = buildCard(ctx.ui.theme, snapshot, {
      enabled: state.enabled,
      debugEnabled: state.debugEnabled,
      lastSync: state.lastSync,
      timestamp: 0,
    });
    ctx.ui.notify(text, 'info');
  };

  const handleCard = async (_args: string[], ctx: ExtensionContext) => {
    await openCard(ctx, getCurrentSnapshot());
  };

  const handleSync = async (args: string[], ctx: ExtensionContext) => {
    const force = args.includes('--force') || args.includes('-f');
    const result = await performSync(pi, {
      syncOnStartup: false,
      addToScope: state.currentConfig.addToScope ?? true,
      providers: state.currentConfig.providers ?? {},
      forceRefresh: force,
    });
    if (result.capabilities) {
      actions.persistLastSync(result.capabilities);
    }
    const note = force ? ' (cache bypassed)' : '';
    ctx.ui.notify(`[Providers] ${result.message}${note}`, result.success ? 'info' : 'error');
  };

  const handleDebug = async (args: string[], ctx: ExtensionContext) => {
    const cmd = args[0]?.toLowerCase();
    if (cmd === 'on') state.debugEnabled = true;
    else if (cmd === 'off') state.debugEnabled = false;
    else state.debugEnabled = !state.debugEnabled;
    actions.persistState();
    ctx.ui.notify(`Debug ${state.debugEnabled ? 'enabled' : 'disabled'}.`, 'info');
  };

  const handleReload = async (_args: string[], ctx: ExtensionContext) => {
    actions.reloadConfig(ctx, { preserveDebug: true });
    ctx.ui.notify(`Config reloaded.`, 'info');
  };

  const handleFooter = async (args: string[], ctx: ExtensionContext) => {
    const cmd = args[0]?.toLowerCase();
    const current = state.currentConfig.showFooterStatus !== false;
    let next: boolean;
    if (cmd === 'on') next = true;
    else if (cmd === 'off') next = false;
    else next = !current;
    actions.setShowFooterStatus(next);
    actions.refreshStatus();
    ctx.ui.notify(`Footer status: ${next ? 'on' : 'off'}.`, 'info');
  };

  const handleLabels = async (args: string[], ctx: ExtensionContext) => {
    const cmd = args[0]?.toLowerCase();
    const current = state.currentConfig.showCapLabelText === true;
    let next: boolean;
    if (cmd === 'on') next = true;
    else if (cmd === 'off') next = false;
    else next = !current;
    actions.setShowCapLabelText(next);
    actions.setShowLocationLabels(next);
    actions.refreshStatus();
    ctx.ui.notify(`Labels: ${next ? 'on' : 'off'}.`, 'info');
  };

  const handleCaps = async (args: string[], ctx: ExtensionContext) => {
    const cmd = args[0]?.toLowerCase();
    const current = state.currentConfig.showCapLabelText === true;
    let next: boolean;
    if (cmd === 'on') next = true;
    else if (cmd === 'off') next = false;
    else next = !current;
    actions.setShowCapLabelText(next);
    actions.refreshStatus();
    ctx.ui.notify(`Cap labels: ${next ? 'on' : 'off'}.`, 'info');
  };

  const handleLocation = async (args: string[], ctx: ExtensionContext) => {
    const cmd = args[0]?.toLowerCase();
    const current = state.currentConfig.showLocationLabels === true;
    let next: boolean;
    if (cmd === 'on') next = true;
    else if (cmd === 'off') next = false;
    else next = !current;
    actions.setShowLocationLabels(next);
    actions.refreshStatus();
    ctx.ui.notify(`Location labels: ${next ? 'on' : 'off'}.`, 'info');
  };

  const handleInit = async (args: string[], ctx: ExtensionContext) => {
    const configPath = join(getAgentDir(), 'local-providers.json');
    const force = args.includes('--force') || args.includes('-f');
    const existing = parseConfigFile(configPath).config;
    const hasExisting = Object.keys(existing).length > 0;

    if (hasExisting && !force) {
      // Merge current in-memory config (with all current toggles/values) into existing file
      // This saves the user's current effective settings AND adds any new fields
      const current = actions.getCurrentConfig();
      const merged = mergeConfig(FALLBACK_CONFIG, { ...existing, ...current });
      writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
      ctx.ui.notify(`Saved current config. Run /providers reload to apply.`, 'info');
      return;
    }

    writeFileSync(configPath, JSON.stringify(FALLBACK_CONFIG, null, 2), 'utf-8');
    ctx.ui.notify(hasExisting
      ? `Reset config to defaults. Run /providers reload to apply.`
      : `Created default config. Run /providers reload to apply.`, 'info');
  };

  pi.registerCommand('providers', {
    description: 'Local model provider discovery control',
    getArgumentCompletions: (prefix) => {
      const trimmedLeft = prefix.trimStart();
      const hasTrailingSpace = /\s$/.test(prefix);
      const parts = trimmedLeft.length > 0 ? trimmedLeft.split(/\s+/) : [];
      if (parts.length === 0) return getSubcommandCompletions('');
      if (parts.length === 1 && !hasTrailingSpace) return getSubcommandCompletions(parts[0]);

      const subcommand = parts[0];
      const subArgs = parts.slice(1);
      if (hasTrailingSpace && parts.length === 1) subArgs.push('');

      if (subcommand === 'debug') {
        const items = ['on', 'off', 'toggle'].filter((v) => v.startsWith(subArgs[0] ?? '')).map((v) => ({
          value: `debug ${v}`, label: v,
        }));
        return items.length > 0 ? items : null;
      }
      if (subcommand === 'footer' || subcommand === 'labels' || subcommand === 'caps' || subcommand === 'location') {
        const items = ['on', 'off', 'toggle'].filter((v) => v.startsWith(subArgs[0] ?? '')).map((v) => ({
          value: `${subcommand} ${v}`, label: v,
        }));
        return items.length > 0 ? items : null;
      }
      if (subcommand === 'sync') {
        const items = ['--force', '-f'].filter((v) => v.startsWith(subArgs[0] ?? '')).map((v) => ({
          value: v, label: v, description: 'Bypass capability cache',
        }));
        return items.length > 0 ? items : null;
      }
      return null;
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? [];
      const subcommand = parts[0];
      const subArgs = parts.slice(1);
      switch (subcommand) {
        case 'sync': await handleSync(subArgs, ctx); break;
        case 'info': await handleInfo(subArgs, ctx); break;
        case 'card': await handleCard(subArgs, ctx); break;
        case 'footer': await handleFooter(subArgs, ctx); break;
        case 'labels': await handleLabels(subArgs, ctx); break;
        case 'caps': await handleCaps(subArgs, ctx); break;
        case 'location': await handleLocation(subArgs, ctx); break;
        case 'debug': await handleDebug(subArgs, ctx); break;
        case 'reload': await handleReload(subArgs, ctx); break;
        case 'init': await handleInit(subArgs, ctx); break;
        case 'status': await handleStatus(subArgs, ctx); break;
        case 'help': case '?':
          ctx.ui.notify(
            ['Providers Commands:',
             '  status             Show sync status and registered models with capabilities.',
             '  sync [--force]     Sync local providers. --force bypasses capability cache.',
             '  info [model]       Show details for a model (defaults to current).',
             '  card               Open the model card popup for the current model.',
             '  footer on/off      Toggle the footer status indicator.',
             '  labels on/off      Toggle all labels (cap + location) at once.',
             '  caps on/off        Toggle capability labels (vision/thinking/tools).',
             '  location on/off    Toggle location labels (cloud/QAT/embed).',
             '  debug on/off       Toggle debug logging.',
             '  reload             Reload configuration.',
             '  init [--force]     Create or update config with current defaults. Use --force to reset.',
             '  help               Show this help.',
            ].join('\n'), 'info');
          break;
        default:
          if (subcommand) ctx.ui.notify(`Unknown: ${subcommand}. Try /providers help`, 'error');
          else await handleStatus(subArgs, ctx);
          break;
      }
    },
  });

  // Keyboard shortcut: ctrl+i opens the model card for the current model
  pi.registerShortcut('ctrl+i', {
    description: 'Open model card for current model',
    handler: async (ctx) => {
      await openCard(ctx, getCurrentSnapshot());
    },
  });
};
