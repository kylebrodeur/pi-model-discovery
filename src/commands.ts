import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import type {
  ModelDiscoveryConfig,
} from './types';
import {
  profileNames,
  resolveProfileName,
} from './config';
import {
  formatModelRef,
} from './ui';
import { performSync } from './sync';

export const registerCommands = (
  pi: ExtensionAPI,
  state: {
    readonly currentConfig: ModelDiscoveryConfig;
    enabled: boolean;
    selectedProfile: string;
    debugEnabled: boolean;
    widgetEnabled: boolean;
  },
  actions: {
    persistState: () => void;
    updateStatus: (ctx: ExtensionContext) => void;
    reloadConfig: (
      ctx?: ExtensionContext,
      options?: { preserveDebug?: boolean },
    ) => void;
  },
) => {
  const SUBCOMMAND_DETAILS = [
    { name: 'status', desc: 'Show current discovery status' },
    { name: 'sync', desc: 'Sync Ollama models into pi configuration' },
    { name: 'profile', desc: 'Switch to a different discovery profile' },
    { name: 'widget', desc: 'Toggle the discovery status widget' },
    { name: 'debug', desc: 'Toggle discovery debug logging' },
    { name: 'reload', desc: 'Reload the model discovery configuration' },
    { name: 'init', desc: 'Create a default model-discovery.json config file' },
    { name: 'help', desc: 'Show usage help for subcommands' },
  ];

  const getSubcommandCompletions = (
    prefix: string,
  ): AutocompleteItem[] | null => {
    const items = SUBCOMMAND_DETAILS.filter((s) =>
      s.name.startsWith(prefix),
    ).map((s) => ({
      value: s.name,
      label: s.name,
      description: s.desc,
    }));
    return items.length > 0 ? items : null;
  };

  const handleStatus = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 0) {
      ctx.ui.notify('Usage: /discovery status (no arguments)', 'error');
      return;
    }
    const names = profileNames(state.currentConfig).join(', ');
    const lines = [
      'Model Discovery Status:',
      `Enabled: ${state.enabled ? 'yes' : 'off'}`,
      `Selected profile: ${state.selectedProfile}`,
      `Widget: ${state.widgetEnabled ? 'on' : 'off'}`,
      `Default profile: ${resolveProfileName(state.currentConfig, state.currentConfig.defaultProfile)}`,
      `Available profiles: ${names}`,
      `Debug: ${state.debugEnabled ? 'on' : 'off'}`,
    ];
    ctx.ui.notify(lines.join('\n'), 'info');
    actions.updateStatus(ctx);
  };

  const handleSync = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 0) {
      ctx.ui.notify('Usage: /discovery sync (no arguments)', 'error');
      return;
    }
    const result = await performSync(pi, {
      syncOnStartup: false,
      addToScope: state.currentConfig.addToScope ?? true,
    });
    if (result.success) {
      ctx.ui.notify(`[Discovery] ${result.message}`, 'info');
    } else {
      ctx.ui.notify(`[Discovery] Sync failed: ${result.message}`, 'error');
    }
  };

  const handleProfile = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 1) {
      ctx.ui.notify('Usage: /discovery profile [name]', 'error');
      return;
    }
    const profileName = args[0];
    if (!profileName) {
      ctx.ui.notify(
        `Current profile: ${state.selectedProfile}. Available: ${profileNames(state.currentConfig).join(', ')}`,
        'info',
      );
      return;
    }
    if (!state.currentConfig.profiles[profileName]) {
      ctx.ui.notify(`Unknown discovery profile: ${profileName}`, 'error');
      return;
    }
    state.selectedProfile = profileName;
    actions.persistState();
    actions.updateStatus(ctx);
    ctx.ui.notify(
      `Switched to discovery profile: ${state.selectedProfile}`,
      'info',
    );
  };

  const handleWidget = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 1) {
      ctx.ui.notify('Usage: /discovery widget <on|off|toggle>', 'error');
      return;
    }
    const cmd = args[0]?.toLowerCase();
    if (cmd === 'on') state.widgetEnabled = true;
    else if (cmd === 'off') state.widgetEnabled = false;
    else state.widgetEnabled = !state.widgetEnabled;
    actions.persistState();
    actions.updateStatus(ctx);
    ctx.ui.notify(
      `Discovery widget ${state.widgetEnabled ? 'enabled' : 'disabled'}.`,
      'info',
    );
  };

  const handleDebug = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 1) {
      ctx.ui.notify('Usage: /discovery debug <on|off|toggle>', 'error');
      return;
    }
    const cmd = args[0]?.toLowerCase();
    if (cmd === 'on') state.debugEnabled = true;
    else if (cmd === 'off') state.debugEnabled = false;
    else state.debugEnabled = !state.debugEnabled;
    actions.persistState();
    ctx.ui.notify(
      `Discovery debug ${state.debugEnabled ? 'enabled' : 'disabled'}.`,
      'info',
    );
  };

  const handleReload = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 0) {
      ctx.ui.notify('Usage: /discovery reload (no arguments)', 'error');
      return;
    }
    actions.reloadConfig(ctx, { preserveDebug: true });
    ctx.ui.notify(
      `Discovery config reloaded. Profiles: ${profileNames(state.currentConfig).join(', ')}`,
      'info',
    );
  };

  const handleInit = async (args: string[], ctx: ExtensionContext) => {
    if (args.length > 0) {
      ctx.ui.notify('Usage: /discovery init (no arguments)', 'error');
      return;
    }

    const configPath = join(getAgentDir(), 'model-discovery.json');
    if (existsSync(configPath)) {
      ctx.ui.notify(
        `Config already exists at ${configPath}. Use /discovery reload to apply changes.`,
        'warning',
      );
      return;
    }

    const defaultConfig = {
      defaultProfile: 'auto',
      debug: false,
      syncOnStartup: true,
      addToScope: true,
      profiles: {
        auto: {
          high: {
            model: 'openai/gpt-4-turbo-preview',
            thinking: 'high',
          },
          medium: { model: 'google/gemini-pro', thinking: 'medium' },
          low: { model: 'anthropic/claude-3-haiku-20240307', thinking: 'low' },
        },
      },
    };

    try {
      writeFileSync(
        configPath,
        JSON.stringify(defaultConfig, null, 2),
        'utf-8',
      );
      ctx.ui.notify(
        `Created default config at ~/.pi/agent/model-discovery.json. Run /discovery reload to apply.`,
        'info',
      );
    } catch (err) {
      ctx.ui.notify(
        `Failed to create config: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    }
  };

  pi.registerCommand('discovery', {
    description: 'Model discovery control center',
    getArgumentCompletions: (prefix) => {
      const trimmedLeft = prefix.trimStart();
      const hasTrailingSpace = /\s$/.test(prefix);
      const parts = trimmedLeft.length > 0 ? trimmedLeft.split(/\s+/) : [];

      if (parts.length === 0) {
        return getSubcommandCompletions('');
      }

      if (parts.length === 1 && !hasTrailingSpace) {
        return getSubcommandCompletions(parts[0]);
      }

      const subcommand = parts[0];
      const subArgs = parts.slice(1);
      if (hasTrailingSpace && parts.length === 1) {
        subArgs.push('');
      }

      switch (subcommand) {
        case 'profile': {
          const profilePrefix = subArgs[0] ?? '';
          const items = profileNames(state.currentConfig)
            .filter((name) => name.startsWith(profilePrefix))
            .map((name) => ({
              value: `profile ${name}`,
              label: `discovery/${name}`,
              description: `Switch to discovery profile "${name}"`,
            }));
          return items.length > 0 ? items : null;
        }
        case 'widget': {
          const widgetPrefix = subArgs[0] ?? '';
          const items = ['on', 'off', 'toggle']
            .filter((v) => v.startsWith(widgetPrefix))
            .map((v) => ({
              value: `widget ${v}`,
              label: v,
              description: `Set widget to ${v}`,
            }));
          return items.length > 0 ? items : null;
        }
        case 'debug': {
          const debugPrefix = subArgs[0] ?? '';
          const items = ['on', 'off', 'toggle']
            .filter((v) => v.startsWith(debugPrefix))
            .map((v) => ({
              value: `debug ${v}`,
              label: v,
              description: `Discovery debug: ${v}`,
            }));
          return items.length > 0 ? items : null;
        }
      }

      return null;
    },
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? [];
      const subcommand = parts[0];
      const subArgs = parts.slice(1);

      switch (subcommand) {
        case 'profile':
          await handleProfile(subArgs, ctx);
          break;
        case 'widget':
          await handleWidget(subArgs, ctx);
          break;
        case 'debug':
          await handleDebug(subArgs, ctx);
          break;
        case 'reload':
          await handleReload(subArgs, ctx);
          break;
        case 'init':
          await handleInit(subArgs, ctx);
          break;
        case 'status':
          await handleStatus(subArgs, ctx);
          break;
        case 'sync':
          await handleSync(subArgs, ctx);
          break;
        case 'help':
        case '?':
          if (subArgs.length > 0) {
            ctx.ui.notify('Usage: /discovery help (no arguments)', 'error');
            return;
          }
          ctx.ui.notify(
            [
              'Discovery Subcommands:',
              '  status                      Show current status, profile, and widget state.',
              '  sync                        Sync Ollama models into pi configuration.',
              '  profile [name]              Switch to a profile. Lists available if no name.',
              '  widget <on|off|toggle>      Control the persistent status widget visibility.',
              '  debug <on|off|toggle>       Control discovery debug logging.',
              '  reload                      Hot-reload the configuration JSON from .pi/model-discovery.json.',
              '  init                        Create a default configuration file if it does not exist.',
              '  help, ?                     Show this help message.',
            ].join('\n'),
            'info',
          );
          break;
        default:
          if (subcommand) {
            ctx.ui.notify(
              `Unknown discovery subcommand: ${subcommand}. Try /discovery help`,
              'error',
            );
          } else {
            await handleStatus(subArgs, ctx);
          }
          break;
      }
    },
  });
};
