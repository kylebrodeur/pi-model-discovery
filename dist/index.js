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
    let selectedProfile = (0, config_1.resolveProfileName)(config_1.FALLBACK_CONFIG, config_1.FALLBACK_CONFIG.defaultProfile);
    let widgetEnabled = false;
    let lastPersistedSnapshot;
    const persistState = () => {
        const state = (0, state_1.buildPersistedState)(enabled, selectedProfile, debugEnabled, widgetEnabled);
        const snapshot = JSON.stringify({
            ...state,
            timestamp: 0,
        });
        if (snapshot === lastPersistedSnapshot) {
            return;
        }
        pi.appendEntry('discovery-state', state);
        lastPersistedSnapshot = snapshot;
    };
    const actions = {
        persistState,
        updateStatus: (ctx) => (0, ui_1.updateStatus)(ctx, enabled, selectedProfile, widgetEnabled, currentConfig),
        reloadConfig: (ctx, options) => {
            const loaded = (0, config_1.loadModelDiscoveryConfig)(currentCwd);
            currentConfig = loaded.config;
            if (!options?.preserveDebug) {
                debugEnabled = currentConfig.debug ?? false;
            }
            selectedProfile = (0, config_1.resolveProfileName)(currentConfig, selectedProfile);
            if (ctx) {
                actions.updateStatus(ctx);
            }
        },
    };
    const restoreStateFromSession = async (ctx) => {
        currentCwd = ctx.cwd;
        actions.reloadConfig(ctx);
        enabled = true;
        selectedProfile = (0, config_1.resolveProfileName)(currentConfig, selectedProfile);
        widgetEnabled = false;
        const entries = ctx.sessionManager.getBranch();
        const savedState = entries
            .filter((entry) => entry.type === 'custom' && entry.customType === 'discovery-state')
            .map((entry) => entry.data)
            .findLast((data) => (0, state_1.isModelDiscoveryState)(data));
        if ((0, state_1.isModelDiscoveryState)(savedState)) {
            selectedProfile = (0, config_1.resolveProfileName)(currentConfig, savedState.selectedProfile);
            enabled = savedState.enabled;
            debugEnabled = savedState.debugEnabled ?? debugEnabled;
            widgetEnabled = savedState.widgetEnabled ?? widgetEnabled;
        }
        persistState();
        actions.updateStatus(ctx);
    };
    (0, commands_1.registerCommands)(pi, {
        get currentConfig() {
            return currentConfig;
        },
        get enabled() {
            return enabled;
        },
        set enabled(v) {
            enabled = v;
        },
        get selectedProfile() {
            return selectedProfile;
        },
        set selectedProfile(v) {
            selectedProfile = v;
        },
        get debugEnabled() {
            return debugEnabled;
        },
        set debugEnabled(v) {
            debugEnabled = v;
        },
        get widgetEnabled() {
            return widgetEnabled;
        },
        set widgetEnabled(v) {
            widgetEnabled = v;
        },
    }, actions);
    pi.on('session_start', async (_event, ctx) => {
        await restoreStateFromSession(ctx);
        if (currentConfig.syncOnStartup) {
            const result = await (0, sync_1.performSync)(pi, {
                syncOnStartup: true,
                addToScope: currentConfig.addToScope ?? true,
            });
            if (result.success && result.added.length > 0) {
                ctx.ui.notify(`[Discovery] Synced ${result.added.length} new Ollama model(s). Run /reload to use them.`, 'info');
            }
            else if (!result.success) {
                ctx.ui.notify(`[Discovery] Ollama sync failed: ${result.message}`, 'warning');
            }
        }
        if (debugEnabled) {
            ctx.ui.notify(`Discovery initialized with profiles: ${Object.keys(currentConfig.profiles).join(', ')}`, 'info');
        }
    });
};
exports.default = modelDiscoveryExtension;
