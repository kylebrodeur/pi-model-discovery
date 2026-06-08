import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryConfig, ModelDiscoveryState } from './types';
import { FALLBACK_CONFIG, loadModelDiscoveryConfig } from './config';
import { isModelDiscoveryState, buildPersistedState } from './state';
import { updateStatus } from './ui';
import { registerCommands } from './commands';
import { performSync } from './sync';
import { snapshotFromState, type ModelSnapshot } from './widget';

const modelDiscoveryExtension = async (pi: ExtensionAPI) => {
  let currentConfig: ModelDiscoveryConfig = FALLBACK_CONFIG;
  let currentCwd = process.cwd();
  let debugEnabled = false;
  let enabled = false;
  let lastSync: ModelDiscoveryState['lastSync'] = undefined;
  let lastPersistedSnapshot: string | undefined;
  let currentModelRef: string | null = null;
  let thinkingLevel: string | null = null;
  let ollamaReachable = false;
  let syncedAt: number | undefined = undefined;
  let activeCtx: ExtensionContext | null = null;

  const persist = (state: ModelDiscoveryState) => {
    const snapshot = JSON.stringify({ ...state, timestamp: 0 });
    if (snapshot === lastPersistedSnapshot) return;
    pi.appendEntry('discovery-state', state);
    lastPersistedSnapshot = snapshot;
  };

  const getCurrentSnapshot = (): ModelSnapshot | null => {
    if (!currentModelRef) return null;
    return snapshotFromState(currentModelRef, {
      enabled, debugEnabled, lastSync, timestamp: 0,
    });
  };

  const refreshStatus = () => {
    if (!activeCtx) return;
    updateStatus(
      activeCtx,
      {
        current: getCurrentSnapshot(),
        totalRegistered: lastSync?.ollama?.modelIds.length ?? 0,
        thinkingLevel,
      },
      currentConfig.showFooterStatus !== false,
      currentConfig.showCapLabelText === true,
      currentConfig.showLocationLabels === true,
    );
  };

  const actions = {
    persistState: () => persist(buildPersistedState(enabled, debugEnabled, lastSync)),
    persistLastSync: (next: ModelDiscoveryState['lastSync']) => {
      lastSync = next;
      syncedAt = Date.now();
      persist(buildPersistedState(enabled, debugEnabled, lastSync));
      refreshStatus();
    },
    setShowFooterStatus: (on: boolean) => {
      currentConfig = { ...currentConfig, showFooterStatus: on };
    },
    setShowCapLabelText: (on: boolean) => {
      currentConfig = { ...currentConfig, showCapLabelText: on };
    },
    setShowLocationLabels: (on: boolean) => {
      currentConfig = { ...currentConfig, showLocationLabels: on };
    },
    updateStatus: (_ctx: ExtensionContext) => refreshStatus(),
    refreshStatus,
    reloadConfig: (ctx?: ExtensionContext, options?: { preserveDebug?: boolean }) => {
      const loaded = loadModelDiscoveryConfig(currentCwd);
      // Merge with the previous in-memory config so toggles (labels on/off, etc.)
      // are not reset when the user runs /providers reload.
      const previous = currentConfig;
      currentConfig = { ...previous, ...loaded.config };
      if (!options?.preserveDebug) debugEnabled = currentConfig.debug ?? false;
      if (ctx) refreshStatus();
    },
    getCurrentConfig: () => currentConfig,
  };

  // ── Startup sync (async factory - runs before session_start) ─────
  actions.reloadConfig();

  if (currentConfig.syncOnStartup) {
    const result = await performSync(pi, {
      syncOnStartup: true,
      addToScope: false,
      providers: currentConfig.providers ?? {},
    });
    if (result.capabilities) {
      lastSync = result.capabilities;
      syncedAt = Date.now();
    }
    ollamaReachable = result.success;
    if (result.added.length > 0) {
      console.log(`[Providers] Registered ${result.added.length} Ollama model(s).`);
    } else if (!result.success) {
      console.log(`[Providers] ${result.message}`);
    }
  }

  const restoreStateFromSession = async (ctx: ExtensionContext) => {
    currentCwd = ctx.cwd;
    activeCtx = ctx;
    actions.reloadConfig(ctx);
    enabled = true;

    const entries = ctx.sessionManager.getBranch() as any[];
    const savedState = entries
      .filter((e) => e.type === 'custom' && e.customType === 'discovery-state')
      .map((e) => e.data)
      .findLast((data) => isModelDiscoveryState(data));

    if (isModelDiscoveryState(savedState)) {
      enabled = savedState.enabled;
      debugEnabled = savedState.debugEnabled ?? debugEnabled;
      if (savedState.lastSync) lastSync = savedState.lastSync;
    }

    actions.persistState();
    refreshStatus();
  };

  registerCommands(
    pi,
    {
      get currentConfig() { return currentConfig; },
      get enabled() { return enabled; },
      set enabled(v) { enabled = v; },
      get debugEnabled() { return debugEnabled; },
      set debugEnabled(v) { debugEnabled = v; },
      get lastSync() { return lastSync; },
      get currentModelRef() { return currentModelRef; },
    },
    actions,
  );

  pi.on('session_start', async (_event, ctx) => {
    activeCtx = ctx;
    await restoreStateFromSession(ctx);

    // Detect already-selected ollama model on startup (so footer shows immediately)
    if (!currentModelRef && ctx.model && ctx.model.provider === 'ollama') {
      currentModelRef = `ollama/${ctx.model.id}`;
    }

    // Scope sync runs after Pi has settled, avoiding startup overwrite
    if (currentConfig.addToScope) {
      const result = await performSync(pi, {
        syncOnStartup: false,
        addToScope: true,
        providers: currentConfig.providers ?? {},
      });
      if (result.capabilities) {
        lastSync = result.capabilities;
        syncedAt = Date.now();
        actions.persistState();
      }
      ollamaReachable = result.success || ollamaReachable;
      if (result.success && result.added.length > 0) {
        ctx.ui.notify(`[Providers] Scope updated with ${result.added.length} model(s).`, 'info');
      }
    }

    refreshStatus();
    if (debugEnabled) ctx.ui.notify('Providers initialized.', 'info');
  });

  pi.on('session_shutdown', () => {
    if (activeCtx) {
      try { updateStatus(activeCtx, { current: null, totalRegistered: 0, thinkingLevel: null }, false); } catch {}
    }
    activeCtx = null;
  });

  pi.on('model_select', async (event, ctx) => {
    currentModelRef = `${event.model.provider}/${event.model.id}`;
    activeCtx = ctx;
    refreshStatus();
  });

  pi.on('thinking_level_select', async (event, ctx) => {
    thinkingLevel = String(event.level);
    activeCtx = ctx;
    refreshStatus();
  });
};

export default modelDiscoveryExtension;
