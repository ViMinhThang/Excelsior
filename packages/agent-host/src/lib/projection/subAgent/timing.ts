import type { ProjectedSubAgent } from "../display.js";
import type {
  SubAgentProjectionState,
  SubAgentProjectionStatus,
} from "./state.js";

function computeTiming(
  state: SubAgentProjectionState,
  status: SubAgentProjectionStatus,
  fallbackTimestamp?: string,
): { startTime: number; endTime: number } {
  if (state.firstTimestamp) {
    const startTime = new Date(state.firstTimestamp).getTime();
    const lastTimestamp = state.lastTimestamp ?? state.firstTimestamp;
    const endTime =
      status === "running" ? Date.now() : new Date(lastTimestamp).getTime();
    return { startTime, endTime };
  }

  if (fallbackTimestamp) {
    const t = new Date(fallbackTimestamp).getTime();
    return { startTime: t, endTime: status === "running" ? Date.now() : t };
  }

  return { startTime: Date.now(), endTime: Date.now() };
}

export function finalizeSubAgentProjection(
  state: SubAgentProjectionState,
  status: SubAgentProjectionStatus,
  fallbackTimestamp?: string,
): ProjectedSubAgent {
  const lines = state.fullOutput.split("\n").filter(Boolean);
  const latestLine = lines[lines.length - 1] || "";
  const { startTime, endTime } = computeTiming(
    state,
    status,
    fallbackTimestamp,
  );

  return {
    status,
    latestLine,
    fullOutput: state.fullOutput,
    toolCalls: state.toolCalls,
    parts: state.parts,
    startTime,
    endTime,
  };
}
