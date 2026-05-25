import type { ProjectionInputState } from "../types.js";
import {
  ProjectionPolicy,
  type ProjectionResult,
} from "./ProjectionPolicy.js";
export type { ProjectionResult } from "./ProjectionPolicy.js";

export class ProjectionService {
  constructor(private readonly policy = new ProjectionPolicy()) {}

  project(input: ProjectionInputState): ProjectionResult {
    return this.policy.project(input);
  }
}
