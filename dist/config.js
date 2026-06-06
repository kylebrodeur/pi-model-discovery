"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModelDiscoveryConfig = exports.normalizeConfig = exports.mergeConfig = exports.parseConfigFile = exports.FALLBACK_CONFIG = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const pi_coding_agent_1 = require("@earendil-works/pi-coding-agent");
exports.FALLBACK_CONFIG = {
    debug: false,
    syncOnStartup: true,
    addToScope: true,
    providers: { ollama: { enabled: true, baseUrl: 'http://127.0.0.1:11434' } },
};
const isObjectRecord = (value) => typeof value === 'object' && value !== null;
const parseConfigFile = (path) => {
    if (!(0, node_fs_1.existsSync)(path)) {
        return { config: {}, warnings: [] };
    }
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
        if (!isObjectRecord(parsed)) {
            return { config: {}, warnings: [`Ignored config at ${path}: expected a JSON object.`] };
        }
        return { config: parsed, warnings: [] };
    }
    catch (error) {
        return {
            config: {},
            warnings: [`Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`],
        };
    }
};
exports.parseConfigFile = parseConfigFile;
const mergeConfig = (base, override) => ({
    debug: override.debug ?? base.debug,
    syncOnStartup: override.syncOnStartup ?? base.syncOnStartup,
    addToScope: override.addToScope ?? base.addToScope,
    providers: override.providers ?? base.providers,
});
exports.mergeConfig = mergeConfig;
const normalizeConfig = (raw) => ({
    config: {
        debug: typeof raw.debug === 'boolean' ? raw.debug : exports.FALLBACK_CONFIG.debug,
        syncOnStartup: typeof raw.syncOnStartup === 'boolean' ? raw.syncOnStartup : exports.FALLBACK_CONFIG.syncOnStartup,
        addToScope: typeof raw.addToScope === 'boolean' ? raw.addToScope : exports.FALLBACK_CONFIG.addToScope,
        providers: raw.providers ?? exports.FALLBACK_CONFIG.providers,
    },
    warnings: [],
});
exports.normalizeConfig = normalizeConfig;
const loadModelDiscoveryConfig = (cwd) => {
    const globalPath = (0, node_path_1.join)((0, pi_coding_agent_1.getAgentDir)(), 'local-providers.json');
    const projectPath = (0, node_path_1.join)(cwd, '.pi', 'local-providers.json');
    const globalResult = (0, exports.parseConfigFile)(globalPath);
    const projectResult = (0, exports.parseConfigFile)(projectPath);
    const merged = (0, exports.mergeConfig)((0, exports.mergeConfig)(exports.FALLBACK_CONFIG, globalResult.config), projectResult.config);
    const normalized = (0, exports.normalizeConfig)(merged);
    return {
        config: normalized.config,
        warnings: [...globalResult.warnings, ...projectResult.warnings, ...normalized.warnings],
    };
};
exports.loadModelDiscoveryConfig = loadModelDiscoveryConfig;
