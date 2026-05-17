import type { AgentMessage } from "@excelsior/core";
import {
  buildAIHistory,
  computeDisplayBlocks,
} from "../../lib/projection/projectionMerger.js";
import type { ProjectedBlock } from "../../lib/projection/display.js";
import type { ProjectionInputState } from "../types.js";

export class ProjectionService {
  buildDisplayBlocks(input: ProjectionInputState): ProjectedBlock[] {
    return computeDisplayBlocks(input);
  }

  buildAIHistory(input: ProjectionInputState): AgentMessage[] {
    return buildAIHistory(input);
  }
}
