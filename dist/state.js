"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPersistedState = exports.isModelDiscoveryState = void 0;
const isModelDiscoveryState = (value) => {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    return typeof v.enabled === 'boolean' && typeof v.timestamp === 'number';
};
exports.isModelDiscoveryState = isModelDiscoveryState;
const buildPersistedState = (enabled, debugEnabled) => ({
    enabled,
    debugEnabled,
    timestamp: Date.now(),
});
exports.buildPersistedState = buildPersistedState;
