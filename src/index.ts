import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  type ModelDiscoveryConfig,
} from './types';
import {
  FALLBACK_CONFIG,
  loadModelDiscoveryConfig,
  resolveProfileName,
} from './config';
import { isModelDiscoveryState, buildPersistedState } from './state';
import { updateStatus } from './ui';
import { registerCommands } from './commands';
import { performSync } from './sync';

const modelDiscoveryExtension = (pi: ExtensionAPI) => {
  let currentConfig: ModelDiscoveryConfig = FALLBACK_CONFIG;
  let currentCwd = process.cwd();
  let debugEnabled = false;
  let enabled = false;
  let selectedProfile = resolveProfileName(
    FALLBACK_CONFIG,
    FALLBACK_CONFIG.defaultProfile,
  );
  let widgetEnabled = false;
  let lastPersistedSnapshot: string | undefined;

  const persistState = () => {
    const state = buildPersistedState(
      enabled,
      selectedProfile,
      debugEnabled,
      widgetEnabled,
    );
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
    updateStatus: (ctx: ExtensionContext) =>
      updateStatus(
        ctx,
        enabled,
        selectedProfile,
        widgetEnabled,
        currentConfig,
      ),
    reloadConfig: (
      ctx?: ExtensionContext,
      options?: { preserveDebug?: boolean },
    ) => {
      const loaded = loadModelDiscoveryConfig(currentCwd);
      currentConfig = loaded.config;
      if (!options?.preserveDebug) {
        debugEnabled = currentConfig.debug ?? false;
      }
      selectedProfile = resolveProfileName(currentConfig, selectedProfile);
      if (ctx) {
        actions.updateStatus(ctx);
      }
    },
  };

  const restoreStateFromSession = async (ctx: ExtensionContext) => {
    currentCwd = ctx.cwd;
    actions.reloadConfig(ctx);

    enabled = true;
    selectedProfile = resolveProfileName(
      currentConfig,
      selectedProfile,
    );
    widgetEnabled = false;

    const entries = ctx.sessionManager.getBranch() as any[];
    const savedState = entries
      .filter(
        (entry) =>
          entry.type === 'custom' && entry.customType === 'discovery-state',
      )
      .map((entry) => entry.data)
      .findLast((data) => isModelDiscoveryState(data));

    if (isModelDiscoveryState(savedState)) {
      selectedProfile = resolveProfileName(
        currentConfig,
        savedState.selectedProfile,
      );
      enabled = savedState.enabled;
      debugEnabled = savedState.debugEnabled ?? debugEnabled;
      widgetEnabled = savedState.widgetEnabled ?? widgetEnabled;
    }

    persistState();
    actions.updateStatus(ctx);
  };

  registerCommands(
    pi,
    {
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
    },
    actions,
  );

  pi.on('session_start', async (_event, ctx) => {
    await restoreStateFromSession(ctx);

    if (currentConfig.syncOnStartup) {
      const result = await performSync(pi, {
        syncOnStartup: true,
        addToScope: currentConfig.addToScope ?? true,
      });
      if (result.success && result.added.length > 0) {
        ctx.ui.notify(
          `[Discovery] Synced ${result.added.length} new Ollama model(s). Run /reload to use them.`,
          'info',
        );
      } else if (!result.success) {
        ctx.ui.notify(
          `[Discovery] Ollama sync failed: ${result.message}`,
          'warning',
        );
      }
    }

    if (debugEnabled) {
      ctx.ui.notify(
        `Discovery initialized with profiles: ${Object.keys(currentConfig.profiles).join(', ')}`,
        'info',
      );
    }
  });
};

export default modelDiscoveryExtension;
