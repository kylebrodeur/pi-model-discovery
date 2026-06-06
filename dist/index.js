"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const state_1 = require("./state");
const ui_1 = require("./ui");
const commands_1 = require("./commands");
const sync_1 = require("./sync");
const modelDiscoveryExtension = (pi) => {
    let currentConfig = config_1.FALLBACK_CONFIG;
    let currentCwd = process.cwd();
    let debugEnabled = false;
    let enabled = false;
    let lastPersistedSnapshot;
    const persistState = () => {
        const state = (0, state_1.buildPersistedState)(enabled, debugEnabled);
        const snapshot = JSON.stringify({ ...state, timestamp: 0 });
        if (snapshot === lastPersistedSnapshot)
            return;
        pi.appendEntry('discovery-state', state);
        lastPersistedSnapshot = snapshot;
    };
    const actions = {
        persistState,
        updateStatus: (ctx) => (0, ui_1.updateStatus)(ctx, enabled),
        reloadConfig: (ctx, options) => {
            const loaded = (0, config_1.loadModelDiscoveryConfig)(currentCwd);
            currentConfig = loaded.config;
            if (!options?.preserveDebug)
                debugEnabled = currentConfig.debug ?? false;
            if (ctx)
                actions.updateStatus(ctx);
        },
    };
    const restoreStateFromSession = async (ctx) => {
        currentCwd = ctx.cwd;
        actions.reloadConfig(ctx);
        enabled = true;
        const entries = ctx.sessionManager.getBranch();
        const savedState = entries
            .filter((e) => e.type === 'custom' && e.customType === 'discovery-state')
            .map((e) => e.data)
            .findLast((data) => (0, state_1.isModelDiscoveryState)(data));
        if ((0, state_1.isModelDiscoveryState)(savedState)) {
            enabled = savedState.enabled;
            debugEnabled = savedState.debugEnabled ?? debugEnabled;
        }
        persistState();
        actions.updateStatus(ctx);
    };
    (0, commands_1.registerCommands)(pi, {
        get currentConfig() { return currentConfig; },
        get enabled() { return enabled; },
        set enabled(v) { enabled = v; },
        get debugEnabled() { return debugEnabled; },
        set debugEnabled(v) { debugEnabled = v; },
    }, actions);
    pi.on('session_start', async (_event, ctx) => {
        await restoreStateFromSession(ctx);
        if (currentConfig.syncOnStartup) {
            const providers = currentConfig.providers ?? {};
            const result = await (0, sync_1.performSync)(pi, {
                syncOnStartup: true,
                addToScope: currentConfig.addToScope ?? true,
                providers,
            });
            if (result.added.length > 0) {
                ctx.ui.notify(`[Discovery] Synced ${result.added.length} model(s). Run /reload.`, 'info');
            }
            else if (!result.success) {
                ctx.ui.notify(`[Discovery] ${result.message}`, 'warning');
            }
        }
        if (debugEnabled) {
            ctx.ui.notify(`Discovery initialized.`, 'info');
        }
    });
};
exports.default = modelDiscoveryExtension;
