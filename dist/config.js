"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProfileName = exports.profileNames = exports.loadModelDiscoveryConfig = exports.normalizeConfig = exports.normalizeTierConfig = exports.parseCanonicalModelRef = exports.mergeConfig = exports.parseConfigFile = exports.isModelTier = exports.isThinkingLevel = exports.isObjectRecord = exports.THINKING_LEVELS = exports.FALLBACK_CONFIG = exports.MODEL_TIERS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const pi_coding_agent_1 = require("@earendil-works/pi-coding-agent");
exports.MODEL_TIERS = ['high', 'medium', 'low'];
exports.FALLBACK_CONFIG = {
    defaultProfile: 'auto',
    debug: false,
    profiles: {
        auto: {
            high: { model: 'openai/gpt-4-turbo-preview', thinking: 'off' },
            medium: { model: 'google/gemini-pro', thinking: 'off' },
            low: { model: 'anthropic/claude-3-haiku-20240307', thinking: 'off' },
        },
    },
};
exports.THINKING_LEVELS = [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
];
const isObjectRecord = (value) => typeof value === 'object' && value !== null;
exports.isObjectRecord = isObjectRecord;
const isThinkingLevel = (value) => typeof value === 'string' && exports.THINKING_LEVELS.includes(value);
exports.isThinkingLevel = isThinkingLevel;
const isModelTier = (value) => value === 'high' || value === 'medium' || value === 'low';
exports.isModelTier = isModelTier;
const parseConfigFile = (path) => {
    if (!(0, node_fs_1.existsSync)(path)) {
        return { config: {}, warnings: [] };
    }
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
        if (!(0, exports.isObjectRecord)(parsed)) {
            return {
                config: {},
                warnings: [`Ignored discovery config at ${path}: expected a JSON object.`],
            };
        }
        return { config: parsed, warnings: [] };
    }
    catch (error) {
        return {
            config: {},
            warnings: [
                `Failed to parse discovery config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
            ],
        };
    }
};
exports.parseConfigFile = parseConfigFile;
const mergeConfig = (base, override) => {
    const mergedProfiles = { ...base.profiles };
    for (const [name, profile] of Object.entries(override.profiles ?? {})) {
        const existing = mergedProfiles[name];
        const nextProfile = profile;
        mergedProfiles[name] = {
            high: {
                ...(existing?.high ?? exports.FALLBACK_CONFIG.profiles.auto.high),
                ...(nextProfile.high ?? {}),
            },
            medium: {
                ...(existing?.medium ?? exports.FALLBACK_CONFIG.profiles.auto.medium),
                ...(nextProfile.medium ?? {}),
            },
            low: {
                ...(existing?.low ?? exports.FALLBACK_CONFIG.profiles.auto.low),
                ...(nextProfile.low ?? {}),
            },
        };
    }
    return {
        defaultProfile: override.defaultProfile ?? base.defaultProfile,
        debug: override.debug ?? base.debug,
        profiles: mergedProfiles,
    };
};
exports.mergeConfig = mergeConfig;
const parseCanonicalModelRef = (value) => {
    const slashIndex = value.indexOf('/');
    if (slashIndex === -1) {
        throw new Error(`Invalid model reference "${value}". Expected "provider/model".`);
    }
    const provider = value.slice(0, slashIndex).trim();
    const modelId = value.slice(slashIndex + 1).trim();
    if (!provider || !modelId) {
        throw new Error(`Invalid model reference "${value}". Expected "provider/model".`);
    }
    return { provider, modelId };
};
exports.parseCanonicalModelRef = parseCanonicalModelRef;
const normalizeTierConfig = (value, fallback, profileName, tier, warnings) => {
    if (!(0, exports.isObjectRecord)(value)) {
        warnings.push(`Profile "${profileName}" has invalid ${tier} tier config. Falling back to ${fallback.model}.`);
        return { ...fallback };
    }
    const model = typeof value.model === 'string' ? value.model.trim() : '';
    let parsedModel = fallback.model;
    if (!model) {
        warnings.push(`Profile "${profileName}" ${tier} tier is missing a model. Falling back to ${fallback.model}.`);
    }
    else {
        try {
            (0, exports.parseCanonicalModelRef)(model);
            parsedModel = model;
        }
        catch (error) {
            warnings.push(error instanceof Error ? error.message : String(error));
        }
    }
    const thinking = (0, exports.isThinkingLevel)(value.thinking)
        ? value.thinking
        : fallback.thinking;
    if (value.thinking !== undefined && !(0, exports.isThinkingLevel)(value.thinking)) {
        warnings.push(`Profile "${profileName}" ${tier} tier has invalid thinking level. Falling back to ${fallback.thinking ?? 'medium'}.`);
    }
    return { model: parsedModel, thinking };
};
exports.normalizeTierConfig = normalizeTierConfig;
const normalizeConfig = (raw) => {
    const warnings = [];
    const normalizedProfiles = {};
    const fallbackAuto = exports.FALLBACK_CONFIG.profiles.auto;
    for (const [name, profile] of Object.entries(raw.profiles ?? {})) {
        normalizedProfiles[name] = {
            high: (0, exports.normalizeTierConfig)(profile?.high, fallbackAuto.high, name, 'high', warnings),
            medium: (0, exports.normalizeTierConfig)(profile?.medium, fallbackAuto.medium, name, 'medium', warnings),
            low: (0, exports.normalizeTierConfig)(profile?.low, fallbackAuto.low, name, 'low', warnings),
        };
    }
    if (Object.keys(normalizedProfiles).length === 0) {
        normalizedProfiles.auto = fallbackAuto;
        warnings.push('No valid discovery profiles found. Falling back to the built-in auto profile.');
    }
    let defaultProfile = typeof raw.defaultProfile === 'string' && raw.defaultProfile.trim()
        ? raw.defaultProfile.trim()
        : undefined;
    if (!defaultProfile || !normalizedProfiles[defaultProfile]) {
        const fallbackProfile = normalizedProfiles[exports.FALLBACK_CONFIG.defaultProfile ?? 'auto']
            ? (exports.FALLBACK_CONFIG.defaultProfile ?? 'auto')
            : Object.keys(normalizedProfiles).sort()[0];
        if (defaultProfile && !normalizedProfiles[defaultProfile]) {
            warnings.push(`Default discovery profile "${defaultProfile}" was not found. Falling back to "${fallbackProfile}".`);
        }
        defaultProfile = fallbackProfile;
    }
    return {
        config: {
            defaultProfile,
            debug: typeof raw.debug === 'boolean' ? raw.debug : false,
            profiles: normalizedProfiles,
        },
        warnings,
    };
};
exports.normalizeConfig = normalizeConfig;
const loadModelDiscoveryConfig = (cwd) => {
    const globalPath = (0, node_path_1.join)((0, pi_coding_agent_1.getAgentDir)(), 'model-discovery.json');
    const projectPath = (0, node_path_1.join)(cwd, '.pi', 'model-discovery.json');
    const globalResult = (0, exports.parseConfigFile)(globalPath);
    const projectResult = (0, exports.parseConfigFile)(projectPath);
    const merged = (0, exports.mergeConfig)((0, exports.mergeConfig)(exports.FALLBACK_CONFIG, globalResult.config), projectResult.config);
    const normalized = (0, exports.normalizeConfig)(merged);
    return {
        config: normalized.config,
        warnings: [
            ...globalResult.warnings,
            ...projectResult.warnings,
            ...normalized.warnings,
        ],
    };
};
exports.loadModelDiscoveryConfig = loadModelDiscoveryConfig;
const profileNames = (config) => {
    return Object.keys(config.profiles).sort();
};
exports.profileNames = profileNames;
const resolveProfileName = (config, requested) => {
    if (requested && config.profiles[requested]) {
        return requested;
    }
    if (config.defaultProfile && config.profiles[config.defaultProfile]) {
        return config.defaultProfile;
    }
    return (0, exports.profileNames)(config)[0] ?? 'auto';
};
exports.resolveProfileName = resolveProfileName;
