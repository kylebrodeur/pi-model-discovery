import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryConfig, ModelDiscoveryState } from './types';
import { FALLBACK_CONFIG, loadModelDiscoveryConfig } from './config';
import { isModelDiscoveryState, buildPersistedState } from './state';
import { updateStatus } from './ui';
import { registerCommands } from './commands';
import { performSync } from './sync';
import { updateWidget, clearWidget, snapshotFromState, type WidgetData } from './widget';

const modelDiscoveryExtension = async (pi: ExtensionAPI) => {
  let currentConfig: ModelDiscoveryConfig = FALLBACK_CONFIG;
  let currentCwd = process.cwd();
  let debugEnabled = false;
  let enabled = false;
  let lastSync: ModelDiscoveryState['lastSync'] = undefined;
  let lastPersistedSnapshot: string | undefined;
  let currentModelRef: string | null = null;
  let thinkingLevel: string | null = null;
  let activeCtx: ExtensionContext | null = null;

  const persist = (state: ModelDiscoveryState) => {
    const snapshot = JSON.stringify({ ...state, timestamp: 0 });
    if (snapshot === lastPersistedSnapshot) return;
    pi.appendEntry('discovery-state', state);
    lastPersistedSnapshot = snapshot;
  };

  const buildWidgetData = (): WidgetData => {
    const total = lastSync?.ollama?.modelIds.length ?? 0;
    const current = currentModelRef
      ? snapshotFromState(currentModelRef, { enabled, debugEnabled, lastSync, timestamp: 0 })
      : null;
    return { current, totalRegistered: total, thinkingLevel };
  };

  const refreshWidget = () => {
    if (!activeCtx) return;
    updateWidget(activeCtx, buildWidgetData());
  };

  const actions = {
    persistState: () => persist(buildPersistedState(enabled, debugEnabled, lastSync)),
    persistLastSync: (next: ModelDiscoveryState['lastSync']) => {
      lastSync = next;
      persist(buildPersistedState(enabled, debugEnabled, lastSync));
      refreshWidget();
    },
    updateStatus: (ctx: ExtensionContext) => updateStatus(ctx, enabled),
    reloadConfig: (ctx?: ExtensionContext, options?: { preserveDebug?: boolean }) => {
      const loaded = loadModelDiscoveryConfig(currentCwd);
      currentConfig = loaded.config;
      if (!options?.preserveDebug) debugEnabled = currentConfig.debug ?? false;
      if (ctx) actions.updateStatus(ctx);
    },
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
    }
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
    actions.updateStatus(ctx);
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
    },
    actions,
  );

  pi.on('session_start', async (_event, ctx) => {
    activeCtx = ctx;
    await restoreStateFromSession(ctx);

    // Scope sync runs after Pi has settled, avoiding startup overwrite
    if (currentConfig.addToScope) {
      const result = await performSync(pi, {
        syncOnStartup: false,
        addToScope: true,
        providers: currentConfig.providers ?? {},
      });
      if (result.capabilities) {
        lastSync = result.capabilities;
        actions.persistState();
      }
      if (result.success && result.added.length > 0) {
        ctx.ui.notify(`[Providers] Scope updated with ${result.added.length} model(s).`, 'info');
      }
    }

    refreshWidget();
    if (debugEnabled) ctx.ui.notify('Providers initialized.', 'info');
  });

  pi.on('session_shutdown', () => {
    if (activeCtx) clearWidget(activeCtx);
    activeCtx = null;
  });

  pi.on('model_select', async (event, ctx) => {
    currentModelRef = `${event.model.provider}/${event.model.id}`;
    activeCtx = ctx;
    refreshWidget();
  });

  pi.on('thinking_level_select', async (event, ctx) => {
    thinkingLevel = String(event.level);
    activeCtx = ctx;
    refreshWidget();
  });
};

export default modelDiscoveryExtension;
