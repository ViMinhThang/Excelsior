import { AnyAgentEvent } from "../runtime/events.js";
import { ReadModel } from "./readModel.js";
import { CHILD_RUN_ATTACHED, RUN_START, RUN_END, USER_INPUT, TEXT_DELTA, TOOL_CALL_END, TOOL_CALL_START, ERROR } from "../runtime/event-names.js";

export type AIHistoryMessage = { role: "user" | "assistant" | "system"; content: string };

export function projectEventsToAIHistory(
  events: readonly AnyAgentEvent[],
): AIHistoryMessage[] {
  const history: AIHistoryMessage[] = [];
  let assistantBuf = "";

  function flushAssistant() {
    if (assistantBuf) {
      history.push({ role: "assistant", content: assistantBuf });
      assistantBuf = "";
    }
  }

  for (const evt of events) {
    switch (evt.type) {
      case USER_INPUT:
        flushAssistant();
        history.push({ role: "user", content: evt.data.content });
        break;
      case TEXT_DELTA:
        assistantBuf += evt.data.delta;
        break;
      case TOOL_CALL_START:
      case TOOL_CALL_END:
        flushAssistant();
        if (evt.type === TOOL_CALL_END) {
          const { result, toolName, toolArgs, status } = evt.data;
          const isError = status === "error" || result?.startsWith("[Error]");
          const label = isError ? "[Error]" : "[Completed]";
          history.push({
            role: "assistant",
            content: `[Tool: ${toolName}(${toolArgs})] ${label}\n${result ?? ""}`,
          });
        }
        break;
      case ERROR:
        flushAssistant();
        history.push({
          role: "assistant",
          content: `[Error] ${evt.data.message}`,
        });
        break;
      case CHILD_RUN_ATTACHED:
      case RUN_START:
      case RUN_END:
        flushAssistant();
        break;
    }
  }
  flushAssistant();
  return history;
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
        break;
    }
    if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
    return history;
  },
};
