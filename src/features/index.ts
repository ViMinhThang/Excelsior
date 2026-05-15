import { createFeatureRegistry } from "./featureRegistry.js";
import { coreFeature } from "./core/feature.js";
import { reviewFeature } from "./review/feature.js";
import { sessionFeature } from "./session/feature.js";
import { settingsFeature } from "./settings/feature.js";
import { modeFeature } from "./mode/feature.js";

export const appFeatures = [
  coreFeature,
  modeFeature,
  settingsFeature,
  sessionFeature,
  reviewFeature,
];

export const appFeatureRegistry = createFeatureRegistry(appFeatures);
