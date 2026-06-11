import {
  SUB_AGENT_EVENT,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  updateSubAgentState,
  upsertToolBlock,
  upsertBlockInTurn,
  toolBlockFromDraft,
} from "./utils.js";

export class SubAgentHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    SUB_AGENT_EVENT,
  ]);

  public apply(event: AnyHarnessEvent, state: ProjectionState): void {
    if (event.type === SUB_AGENT_EVENT) {
      const id = `${event.turnId ?? event.runId}:${event.data.parentToolCallId}`;
      state.subAgentStates.set(
        id,
        updateSubAgentState(state.subAgentStates.get(id), event.data.event, event.timestamp || new Date().toISOString())
      );
      if (state.tool?.id === id) {
        upsertToolBlock(state, state.tool, false);
      } else {
        let found = false;
        for (const turn of state.turns) {
          const existingIndex = turn.blocks.findIndex((item) => item.id === id);
          if (existingIndex !== -1) {
            const existing = turn.blocks[existingIndex];
            if (existing?.type === "sub-agent") {
              turn.blocks[existingIndex] = {
                ...existing,
                state: state.subAgentStates.get(id)!,
                ...(state.subAgentStates.get(id)!.status !== "running" ? { isFrozen: true as const } : {}),
              };
              found = true;
              break;
            }
          }
        }
        if (!found) {
          const block = toolBlockFromDraft({
            id,
            toolName: "spawnSubAgent",
            toolArgs: "",
            status: "pending",
            result: "",
            timestamp: event.timestamp || new Date().toISOString(),
            startTimestamp: event.timestamp || new Date().toISOString(),
          }, false, state.subAgentStates.get(id));
          upsertBlockInTurn(state, event.turnId, block);
        }
      }
    }
  }
}
