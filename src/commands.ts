import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import type { ModelDiscoveryConfig, ModelDiscoveryState } from './types';
import { performSync } from './sync';

export const registerCommands = (
  pi: ExtensionAPI,
  state: {
    readonly currentConfig: ModelDiscoveryConfig;
    enabled: boolean;
    debugEnabled: boolean;
    lastSync: ModelDiscoveryState['lastSync'];
  },
  actions: {
    persistState: () => void;
    updateStatus: (ctx: ExtensionContext) => void;
    reloadConfig: (ctx?: ExtensionContext, options?: { preserveDebug?: boolean }) => void;
    persistLastSync: (lastSync: ModelDiscoveryState['lastSync']) => void;
  },
) => {
  const SUBCOMMAND_DETAILS = [
    { name: 'status', desc: 'Show sync status and registered models' },
    { name: 'sync', desc: 'Sync local providers into pi configuration' },
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

  const handleStatus = async (_args: string[], ctx: ExtensionContext) => {
    const ollamaCfg = state.currentConfig.providers?.ollama;
    const ollamaEnabled = ollamaCfg?.enabled !== false;
    const ollamaBaseUrl = ollamaCfg?.baseUrl ?? 'http://127.0.0.1:11434';

    const lines = [
      `Local Providers Status:`,
      `Sync on startup: ${state.currentConfig.syncOnStartup ? 'yes' : 'no'}`,
      `Add to scope: ${state.currentConfig.addToScope ? 'yes' : 'no'}`,
      `Cleanup stale: ${ollamaCfg?.cleanupStale ? 'yes' : 'no'}`,
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

  const handleInit = async (_args: string[], ctx: ExtensionContext) => {
    const configPath = join(getAgentDir(), 'local-providers.json');
    if (existsSync(configPath)) {
      ctx.ui.notify(`Config already exists at ${configPath}.`, 'warning');
      return;
    }
    const defaultConfig = {
      syncOnStartup: true,
      addToScope: true,
      providers: { ollama: { enabled: true, baseUrl: 'http://127.0.0.1:11434' } },
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    ctx.ui.notify(`Created default config. Run /providers reload to apply.`, 'info');
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
        case 'debug': await handleDebug(subArgs, ctx); break;
        case 'reload': await handleReload(subArgs, ctx); break;
        case 'init': await handleInit(subArgs, ctx); break;
        case 'status': await handleStatus(subArgs, ctx); break;
        case 'help': case '?':
          ctx.ui.notify(
            ['Providers Commands:',
             '  status             Show sync status and registered models with capabilities.',
             '  sync [--force]     Sync local providers. --force bypasses capability cache.',
             '  debug on/off       Toggle debug logging.',
             '  reload             Reload configuration.',
             '  init               Create default config file.',
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
};
