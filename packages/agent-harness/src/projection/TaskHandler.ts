import {
  TASKS_UPDATED,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";

export class TaskHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([TASKS_UPDATED]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    if (event.type === TASKS_UPDATED) {
      projection.tasks.replace({ tasks: event.data.tasks });
    }
  }
}
