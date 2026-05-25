import type { AgentMessage } from "@excelsior/core";
import {
  buildAIHistory,
  computeDisplayBlocks,
} from "../../lib/projection/projectionMerger.js";
import type { ProjectedBlock } from "../../lib/projection/display.js";
import type { ProjectionInputState } from "../types.js";

export interface ProjectionResult {
  displayBlocks: ProjectedBlock[];
  aiHistory: AgentMessage[];
}

export class ProjectionService {
  project(input: ProjectionInputState): ProjectionResult {
    return {
      displayBlocks: computeDisplayBlocks(input),
      aiHistory: buildAIHistory(input),
    };
  }
}
