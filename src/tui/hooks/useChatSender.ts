import { useCallback, useRef, useState } from "react";
import { Message, StreamCallbacks } from "../../types.js";
import { createAgent } from "../../agent/agent.js";
import { logError } from "../../db/index.js";
import { persistMessage } from "../lib/chatPersistence.js";
import { mapMessagesToAIHistory, generateId, formatErrorMessage } from "./useChatSenderUtils.js";

export function useChatSender() {
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const appendRef = useRef<(msg: Message) => void>(() => {});
  const updateByIdRef = useRef<(id: string, updates: Partial<Message>) => void>(() => {});

  const setCallbacks = useCallback((deps: {
    messages: Message[];
    append: (msg: Message) => void;
    updateById: (id: string, updates: Partial<Message>) => void;
  }) => {
    messagesRef.current = deps.messages;
    appendRef.current = deps.append;
    updateByIdRef.current = deps.updateById;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const streamResponse = useCallback(async (
    history: { role: string; content: string }[],
    callbacks: StreamCallbacks,
  ): Promise<string> => {
    const abortController = new AbortController();
    abortRef.current = abortController;

    let fullContent = "";
    let cancelled = false;

    try {
      const agent = createAgent();
      const stream = await agent.stream({ messages: history as any });

      for await (const part of stream.fullStream) {
        if (abortController.signal.aborted) {
          cancelled = true;
          break;
        }

        if (part.type === "text-delta") {
          fullContent += (part as any).text ?? (part as any).textDelta ?? "";
          callbacks.onTextDelta(fullContent);
        } else if (part.type === "tool-call") {
          callbacks.onToolCall(
            (part as any).toolName ?? (part as any).name ?? "unknown",
            JSON.stringify((part as any).input ?? {}),
            (part as any).toolCallId,
          );
        } else if (part.type === "tool-result") {
          const output = (part as any).output;
          const result = output?.type === "text" ? output.value : JSON.stringify(output ?? "No result returned");
          callbacks.onToolResult((part as any).toolCallId, result);
        }
      }

      callbacks.onFinish(fullContent, cancelled);
      return fullContent;
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setIsLoading(true);
    cancelledRef.current = false;

    const append = appendRef.current;
    const updateById = updateByIdRef.current;
    const history = [...mapMessagesToAIHistory(messagesRef.current), { role: "user" as const, content: trimmed }];

    const userMsg: Message = { id: generateId(), role: "user", content: trimmed, timestamp: new Date().toISOString() };
    append(userMsg);
    persistMessage(userMsg);

    let currentId: string | null = null;
    const turnIds: string[] = [];
    let toolBuffer: any[] = [];
    const toolMap = new Map<string, { msgId: string; toolName: string; toolArgs: string }>();

    try {
      await streamResponse(history, {
        onTextDelta: (text) => {
          if (!currentId) {
            currentId = generateId();
            turnIds.push(currentId);
            append({ id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] });
            toolBuffer = [];
          } else {
            updateById(currentId, { content: text });
          }
        },
        onToolCall: (name, args, callId) => {
          const msgId = generateId();
          toolMap.set(callId, { msgId, toolName: name, toolArgs: args });
          const newCall = { toolCallId: callId, toolName: name, toolArgs: args };
          toolBuffer.push(newCall);

          if (currentId) {
            const assistant = messagesRef.current.find(m => m.id === currentId);
            updateById(currentId, { toolCalls: [...(assistant?.toolCalls || []), newCall] });
          }

          currentId = null;
          append({ id: msgId, role: "tool-call", content: args, timestamp: new Date().toISOString(), toolCall: { toolName: name, toolArgs: args, toolCallId: callId, status: "pending" } });
        },
        onToolResult: (callId, result) => {
          const info = toolMap.get(callId);
          if (!info) return;
          const toolMsg = { id: info.msgId, role: "tool-call" as const, content: result, timestamp: new Date().toISOString(), toolCall: { toolName: info.toolName, toolArgs: info.toolArgs, toolCallId: callId, status: "completed" as const } };
          updateById(info.msgId, toolMsg);
          persistMessage(toolMsg);
        },
        onFinish: (text, cancelled) => {
          if (!currentId && (text || toolBuffer.length > 0)) {
            currentId = generateId();
            turnIds.push(currentId);
            append({ id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] });
          }
          turnIds.forEach(id => {
            const msg = messagesRef.current.find(m => m.id === id);
            if (!msg) return;
            const updated = (cancelled && id === currentId) ? { ...msg, content: (msg.content || text || "") + "\n\n[Cancelled]" } : msg;
            if (cancelled && id === currentId) updateById(id, updated);
            persistMessage(updated);
          });
        },
      });
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.message?.includes("abort")) return;
      logError(`Agent Error: ${error.message}`, error.stack);
      const displayError = formatErrorMessage(error);
      if (currentId) updateById(currentId, { content: `Error: ${displayError}` });
      else append({ id: `err_${Date.now()}`, role: "assistant", content: `Error: ${displayError}`, timestamp: new Date().toISOString() });
    } finally {
      setIsLoading(false);
    }
  }, [streamResponse]);

  return { isLoading, sendMessage, cancel, setCallbacks };
}
