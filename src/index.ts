import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryConfig, ModelDiscoveryState } from './types';
import { FALLBACK_CONFIG, loadModelDiscoveryConfig } from './config';
import { isModelDiscoveryState, buildPersistedState } from './state';
import { updateStatus } from './ui';
import { registerCommands } from './commands';
import { performSync } from './sync';

const modelDiscoveryExtension = async (pi: ExtensionAPI) => {
  let currentConfig: ModelDiscoveryConfig = FALLBACK_CONFIG;
  let currentCwd = process.cwd();
  let debugEnabled = false;
  let enabled = false;
  let lastSync: ModelDiscoveryState['lastSync'] = undefined;
  let lastPersistedSnapshot: string | undefined;

  const persist = (state: ModelDiscoveryState) => {
    const snapshot = JSON.stringify({ ...state, timestamp: 0 });
    if (snapshot === lastPersistedSnapshot) return;
    pi.appendEntry('discovery-state', state);
    lastPersistedSnapshot = snapshot;
  };

  const actions = {
    persistState: () => persist(buildPersistedState(enabled, debugEnabled, lastSync)),
    persistLastSync: (next: ModelDiscoveryState['lastSync']) => {
      lastSync = next;
      persist(buildPersistedState(enabled, debugEnabled, lastSync));
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

    if (debugEnabled) ctx.ui.notify('Providers initialized.', 'info');
  });
};

export default modelDiscoveryExtension;
