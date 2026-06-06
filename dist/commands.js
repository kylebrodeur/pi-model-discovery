"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = void 0;
const pi_coding_agent_1 = require("@earendil-works/pi-coding-agent");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const sync_1 = require("./sync");
const registerCommands = (pi, state, actions) => {
    const SUBCOMMAND_DETAILS = [
        { name: 'status', desc: 'Show sync status and config' },
        { name: 'sync', desc: 'Sync Ollama models into pi configuration' },
        { name: 'debug', desc: 'Toggle debug logging' },
        { name: 'reload', desc: 'Reload configuration' },
        { name: 'init', desc: 'Create default config file' },
        { name: 'help', desc: 'Show help' },
    ];
    const getSubcommandCompletions = (prefix) => {
        const items = SUBCOMMAND_DETAILS.filter((s) => s.name.startsWith(prefix)).map((s) => ({
            value: s.name, label: s.name, description: s.desc,
        }));
        return items.length > 0 ? items : null;
    };
    const handleStatus = async (args, ctx) => {
        const ollamaCfg = state.currentConfig.providers?.ollama;
        const ollamaEnabled = ollamaCfg?.enabled !== false;
        const ollamaBaseUrl = ollamaCfg?.baseUrl ?? 'http://127.0.0.1:11434';
        const lines = [
            `Model Discovery Status:`,
            `Enabled: ${state.enabled ? 'yes' : 'off'}`,
            `Sync on startup: ${state.currentConfig.syncOnStartup ? 'yes' : 'no'}`,
            `Add to scope: ${state.currentConfig.addToScope ? 'yes' : 'no'}`,
            `Providers:`,
            `  ollama: ${ollamaEnabled ? `watching (${ollamaBaseUrl})` : 'disabled'}`,
            `Debug: ${state.debugEnabled ? 'on' : 'off'}`,
        ];
        ctx.ui.notify(lines.join('\n'), 'info');
        actions.updateStatus(ctx);
    };
    const handleSync = async (args, ctx) => {
        const providers = state.currentConfig.providers ?? {};
        const result = await (0, sync_1.performSync)(pi, {
            syncOnStartup: false,
            addToScope: state.currentConfig.addToScope ?? true,
            providers,
        });
        ctx.ui.notify(`[Discovery] ${result.message}`, result.success ? 'info' : 'error');
    };
    const handleDebug = async (args, ctx) => {
        const cmd = args[0]?.toLowerCase();
        if (cmd === 'on')
            state.debugEnabled = true;
        else if (cmd === 'off')
            state.debugEnabled = false;
        else
            state.debugEnabled = !state.debugEnabled;
        actions.persistState();
        ctx.ui.notify(`Debug ${state.debugEnabled ? 'enabled' : 'disabled'}.`, 'info');
    };
    const handleReload = async (args, ctx) => {
        actions.reloadConfig(ctx, { preserveDebug: true });
        ctx.ui.notify(`Config reloaded.`, 'info');
    };
    const handleInit = async (args, ctx) => {
        const configPath = (0, node_path_1.join)((0, pi_coding_agent_1.getAgentDir)(), 'model-discovery.json');
        if ((0, node_fs_1.existsSync)(configPath)) {
            ctx.ui.notify(`Config already exists at ${configPath}.`, 'warning');
            return;
        }
        const defaultConfig = {
            syncOnStartup: true,
            addToScope: true,
            providers: { ollama: { enabled: true, baseUrl: 'http://127.0.0.1:11434' } },
        };
        (0, node_fs_1.writeFileSync)(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        ctx.ui.notify(`Created default config. Run /discovery reload to apply.`, 'info');
    };
    pi.registerCommand('discovery', {
        description: 'Model discovery control center',
        getArgumentCompletions: (prefix) => {
            const trimmedLeft = prefix.trimStart();
            const hasTrailingSpace = /\s$/.test(prefix);
            const parts = trimmedLeft.length > 0 ? trimmedLeft.split(/\s+/) : [];
            if (parts.length === 0)
                return getSubcommandCompletions('');
            if (parts.length === 1 && !hasTrailingSpace)
                return getSubcommandCompletions(parts[0]);
            const subcommand = parts[0];
            const subArgs = parts.slice(1);
            if (hasTrailingSpace && parts.length === 1)
                subArgs.push('');
            if (subcommand === 'debug') {
                const items = ['on', 'off', 'toggle'].filter((v) => v.startsWith(subArgs[0] ?? '')).map((v) => ({
                    value: `debug ${v}`, label: v,
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
                case 'sync':
                    await handleSync(subArgs, ctx);
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
                case 'help':
                case '?':
                    ctx.ui.notify(['Discovery Commands:',
                        '  status      Show sync status and config.',
                        '  sync        Sync Ollama models into pi configuration.',
                        '  debug on/off Toggle debug logging.',
                        '  reload      Reload configuration.',
                        '  init        Create default config file.',
                        '  help        Show this help.',
                    ].join('\n'), 'info');
                    break;
                default:
                    if (subcommand)
                        ctx.ui.notify(`Unknown: ${subcommand}. Try /discovery help`, 'error');
                    else
                        await handleStatus(subArgs, ctx);
                    break;
            }
        },
    });
};
exports.registerCommands = registerCommands;
