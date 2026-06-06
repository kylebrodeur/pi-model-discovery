"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = exports.formatModelRef = void 0;
const formatModelRef = (ref) => {
    return ref ?? 'none';
};
exports.formatModelRef = formatModelRef;
const updateStatus = (ctx, enabled, selectedProfile, widgetEnabled, currentConfig) => {
    const statusText = `discovery:${selectedProfile}`;
    ctx.ui.setStatus('discovery', ctx.ui.theme.fg('dim', statusText));
    if (!widgetEnabled) {
        ctx.ui.setWidget('discovery', undefined);
        return;
    }
    const widgetLines = [
        `Discovery: ${enabled ? 'enabled' : 'disabled'}`,
        `Profile: ${selectedProfile}`,
    ];
    ctx.ui.setWidget('discovery', widgetLines.map((line) => ctx.ui.theme.fg('dim', line)));
};
exports.updateStatus = updateStatus;
