import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModelDiscoveryConfig } from './types';
import { FALLBACK_CONFIG, loadModelDiscoveryConfig } from './config';
import { isModelDiscoveryState, buildPersistedState } from './state';
import { updateStatus } from './ui';
import { registerCommands } from './commands';
import { performSync } from './sync';

const modelDiscoveryExtension = (pi: ExtensionAPI) => {
  let currentConfig: ModelDiscoveryConfig = FALLBACK_CONFIG;
  let currentCwd = process.cwd();
  let debugEnabled = false;
  let enabled = false;
  let lastPersistedSnapshot: string | undefined;

  const persistState = () => {
    const state = buildPersistedState(enabled, debugEnabled);
    const snapshot = JSON.stringify({ ...state, timestamp: 0 });
    if (snapshot === lastPersistedSnapshot) return;
    pi.appendEntry('discovery-state', state);
    lastPersistedSnapshot = snapshot;
  };

  const actions = {
    persistState,
    updateStatus: (ctx: ExtensionContext) => updateStatus(ctx, enabled),
    reloadConfig: (ctx?: ExtensionContext, options?: { preserveDebug?: boolean }) => {
      const loaded = loadModelDiscoveryConfig(currentCwd);
      currentConfig = loaded.config;
      if (!options?.preserveDebug) debugEnabled = currentConfig.debug ?? false;
      if (ctx) actions.updateStatus(ctx);
    },
  };

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
    }

    persistState();
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
    },
    actions,
  );

  pi.on('session_start', async (_event, ctx) => {
    await restoreStateFromSession(ctx);

    if (currentConfig.syncOnStartup) {
      const providers = currentConfig.providers ?? {};
      const result = await performSync(pi, {
        syncOnStartup: true,
        addToScope: currentConfig.addToScope ?? true,
        providers,
      });
      if (result.added.length > 0) {
        ctx.ui.notify(`[Discovery] Synced ${result.added.length} model(s). Run /reload.`, 'info');
      } else if (!result.success) {
        ctx.ui.notify(`[Discovery] ${result.message}`, 'warning');
      }
    }

    if (debugEnabled) {
      ctx.ui.notify(`Discovery initialized.`, 'info');
    }
  });
};

export default modelDiscoveryExtension;
