"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = void 0;
const updateStatus = (ctx, enabled) => {
    ctx.ui.setStatus('discovery', ctx.ui.theme.fg('dim', `discovery:${enabled ? 'on' : 'off'}`));
    ctx.ui.setWidget('discovery', undefined);
};
exports.updateStatus = updateStatus;
