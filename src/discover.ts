import {
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Model, Api } from '@earendil-works/pi-ai';

export const discoverModels = (
  ctx: ExtensionContext,
): Record<string, Model<Api>[]> => {
  const models = ctx.modelRegistry.getAll();
  const groupedModels: Record<string, Model<Api>[]> = {};

  for (const model of models) {
    if (!groupedModels[model.provider]) {
      groupedModels[model.provider] = [];
    }
    groupedModels[model.provider].push(model);
  }

  return groupedModels;
};
