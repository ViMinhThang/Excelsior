import { AnyAgentEvent } from "../runtime/events.js";
import { ReadModel, projectEvents } from "./readModel.js";
import { CHILD_RUN_ATTACHED, RUN_START, RUN_END, USER_INPUT, TEXT_DELTA, TOOL_CALL_END, TOOL_CALL_START, ERROR, TURN_COMPLETE } from "../runtime/eventNames.js";

export type AIHistoryMessage = { role: "user" | "assistant" | "system"; content: string };

export function projectEventsToAIHistory(
  events: readonly AnyAgentEvent[],
): AIHistoryMessage[] {
  return projectEvents(aiHistoryModel, events);
}

export const aiHistoryModel: ReadModel<AIHistoryMessage[], AnyAgentEvent> = {
  initialState: () => [],
  apply(history, event) {
    let assistantBuf = "";
    const last = history[history.length - 1];
    if (last?.role === "assistant" && !last.content.startsWith("[Tool:") && !last.content.startsWith("[Error]")) {
      assistantBuf = last.content;
      history.pop();
    }
    switch (event.type) {
      case USER_INPUT:
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        history.push({ role: "user", content: event.data.content });
        break;
      case TEXT_DELTA:
        assistantBuf += event.data.delta;
        break;
      case TOOL_CALL_END: {
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        assistantBuf = "";
        const { result, toolName, toolArgs, status } = event.data;
        const isError = status === "error" || result?.startsWith("[Error]");
        const label = isError ? "[Error]" : "[Completed]";
        history.push({
          role: "assistant",
          content: `[Tool: ${toolName}(${toolArgs})] ${label}\n${result ?? ""}`,
        });
        break;
      }
      case ERROR:
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        assistantBuf = "";
        history.push({ role: "assistant", content: `[Error] ${event.data.message}` });
        break;
      case TOOL_CALL_START:
      case CHILD_RUN_ATTACHED:
      case RUN_START:
      case RUN_END:
      case TURN_COMPLETE:
        break;
    }
    if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
    return history;
  },
};
