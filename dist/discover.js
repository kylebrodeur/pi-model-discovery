"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverModels = void 0;
const discoverModels = (ctx) => {
    const models = ctx.modelRegistry.getAll();
    const groupedModels = {};
    for (const model of models) {
        if (!groupedModels[model.provider]) {
            groupedModels[model.provider] = [];
        }
        groupedModels[model.provider].push(model);
    }
    return groupedModels;
};
exports.discoverModels = discoverModels;
