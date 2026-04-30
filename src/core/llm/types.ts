import { type LanguageModel } from "ai";

export interface ProviderDefinition {
  id: string;
  label: string;
  apiKeyField: string;
  modelField: string;
  recommendedModels: string[];
  createModel: (config: any, modelName: string) => LanguageModel;
}
