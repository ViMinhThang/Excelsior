import type { AnyHarnessEvent, HarnessEventEmitter } from "../events.js";
import {
  TURN_END,
  TURN_START,
  MESSAGE_START,
  MESSAGE_UPDATE,
  MESSAGE_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TOOL_EXECUTION_END,
} from "../events.js";

export function findIncompleteEvents(events: readonly AnyHarnessEvent[], runId: string, turnId: string) {
  const openAssistantMessages = new Map<string, { id: string; content: string }>();
  const openTools = new Map<string, { toolName: string; toolArgs: string }>();
  let turnOpen = false;

  for (const event of events) {
    if (event.runId !== runId || event.turnId !== turnId) continue;

    if (event.type === TURN_END) {
      turnOpen = false;
    } else if (event.type === TURN_START) {
      turnOpen = true;
    } else if (event.type === MESSAGE_START && event.data.message.role === "assistant") {
      openAssistantMessages.set(event.data.message.id, {
        id: event.data.message.id,
        content: event.data.message.content,
      });
    } else if (event.type === MESSAGE_UPDATE) {
      const message = openAssistantMessages.get(event.data.messageId);
      if (message) {
        openAssistantMessages.set(event.data.messageId, {
          id: message.id,
          content: `${message.content}${event.data.delta}`,
        });
      }
    } else if (event.type === MESSAGE_END && event.data.message.role === "assistant") {
      openAssistantMessages.delete(event.data.message.id);
    } else if (event.type === TOOL_EXECUTION_START) {
      openTools.set(event.data.toolCallId, {
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
      });
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      const tool = openTools.get(event.data.toolCallId);
      if (tool) {
        openTools.set(event.data.toolCallId, {
          toolName: tool.toolName,
          toolArgs: `${tool.toolArgs}${event.data.delta}`,
        });
      }
    } else if (event.type === TOOL_EXECUTION_END) {
      openTools.delete(event.data.toolCallId);
    }
  }

  return {
    openAssistantMessages: Array.from(openAssistantMessages.values()),
    openTools: Array.from(openTools.entries()).map(([toolCallId, val]) => ({
      toolCallId,
      ...val,
    })),
    turnOpen,
  };
}

export function emitRunFinalization(
  incomplete: ReturnType<typeof findIncompleteEvents>,
  reason: string,
  emit: HarnessEventEmitter,
): void {
  for (const message of incomplete.openAssistantMessages) {
    emit(MESSAGE_END, {
      message: { id: message.id, role: "assistant", content: message.content, isError: true },
    });
  }
  for (const tool of incomplete.openTools) {
    emit(TOOL_EXECUTION_END, {
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      toolArgs: tool.toolArgs,
      result: `${reason} Tool input did not complete.`,
      isError: true,
    }, { relatedToolCallId: tool.toolCallId });
  }
  if (incomplete.turnOpen) {
    emit(TURN_END, { cancelled: true });
  }
}
