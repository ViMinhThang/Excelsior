import { useCallback, useRef, useState } from "react";
import { Message } from "../../types.js";
import { createAgent } from "../../agent/agent.js";
import { logError } from "../../db/index.js";
import { persistMessage } from "../lib/chatPersistence.js";

export interface StreamCallbacks {
  onTextDelta: (fullText: string) => void;
  onToolCall: (toolName: string, args: string, toolCallId: string) => void;
  onToolResult: (toolCallId: string, result: string) => void;
  onFinish: (fullText: string, cancelled: boolean) => void;
}

export function useChatSender() {
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const appendRef = useRef<(msg: Message) => void>(() => {});
  const updateByIdRef = useRef<(id: string, updates: Partial<Message>) => void>(() => {});

  const setCallbacks = useCallback(
    (deps: {
      messages: Message[];
      append: (msg: Message) => void;
      updateById: (id: string, updates: Partial<Message>) => void;
    }) => {
      messagesRef.current = deps.messages;
      appendRef.current = deps.append;
      updateByIdRef.current = deps.updateById;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const streamResponse = useCallback(
    async (
      history: { role: string; content: string }[],
      callbacks: StreamCallbacks,
    ): Promise<string> => {
      const abortController = new AbortController();
      abortRef.current = abortController;

      let fullContent = "";
      let cancelled = false;

      try {
        const agent = createAgent();
        const stream = await agent.stream({
          messages: history as any,
        });

        for await (const part of stream.fullStream) {
          if (abortController.signal.aborted) {
            cancelled = true;
            break;
          }

          switch (part.type) {
            case "text-delta": {
              const delta =
                (part as any).text ?? (part as any).textDelta ?? "";
              fullContent += delta;
              callbacks.onTextDelta(fullContent);
              break;
            }
            case "tool-call": {
              callbacks.onToolCall(
                (part as any).toolName ??
                  (part as any).name ??
                  "unknown",
                JSON.stringify((part as any).input ?? {}),
                (part as any).toolCallId,
              );
              break;
            }
            case "tool-result": {
              const output = (part as any).output;
              const result =
                output?.type === "text"
                  ? output.value
                  : output?.type === "json"
                    ? JSON.stringify(output.value)
                    : JSON.stringify(output ?? "No result returned");
              callbacks.onToolResult((part as any).toolCallId, result);
              break;
            }
          }
        }

        callbacks.onFinish(fullContent, cancelled);
        return fullContent;
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      setIsLoading(true);
      cancelledRef.current = false;

      const currentMessages = messagesRef.current;
      const append = appendRef.current;
      const updateById = updateByIdRef.current;

      const history = currentMessages.map((m) => ({
        role: m.role === "tool-call" ? ("tool" as const) : m.role,
        content: m.content,
      }));
      history.push({ role: "user" as const, content: trimmed });

      const userMsg: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      append(userMsg);
      persistMessage(userMsg);

      const assistantId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      append({
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      });

      const toolCallMap = new Map<string, string>();
      const toolCallInfoMap = new Map<string, { toolName: string; toolArgs: string }>();

      try {
        await streamResponse(history, {
          onTextDelta: (fullText) => {
            updateById(assistantId, { content: fullText });
          },
          onToolCall: (toolName, args, toolCallId) => {
            const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            toolCallMap.set(toolCallId, msgId);
            toolCallInfoMap.set(toolCallId, { toolName, toolArgs: args });
            append({
              id: msgId,
              role: "tool-call",
              content: args,
              timestamp: new Date().toISOString(),
              toolCall: { toolName, toolArgs: args, toolCallId, status: "pending" },
            });
          },
          onToolResult: (toolCallId, result) => {
            const msgId = toolCallMap.get(toolCallId);
            const info = toolCallInfoMap.get(toolCallId);
            if (msgId && info) {
              updateById(msgId, { content: result, toolCall: { ...info, toolCallId, status: "completed" } });
              persistMessage({
                id: msgId,
                role: "tool-call",
                content: result,
                timestamp: new Date().toISOString(),
                toolCall: { ...info, toolCallId, status: "completed" },
              });
              toolCallMap.delete(toolCallId);
              toolCallInfoMap.delete(toolCallId);
            }
          },
          onFinish: (fullText, cancelled) => {
            if (cancelled) {
              const current = messagesRef.current.find((m) => m.id === assistantId);
              updateById(assistantId, {
                content: (current?.content || fullText || "") + "\n\n[Cancelled]",
              });
            } else if (fullText) {
              persistMessage({
                id: assistantId,
                role: "assistant",
                content: fullText,
              });
            }
          },
        });
      } catch (error: any) {
        if (
          error?.name === "AbortError" ||
          error?.message?.includes("abort")
        ) {
          return;
        }
        logError(`Agent Error: ${error.message}`, error.stack);
        let displayError = error.message;
        if (error.message.includes("401") || error.message.includes("API key")) {
          displayError =
            "Invalid or missing API key. Please check your settings (ctrl+s).";
        } else if (error.message.includes("fetch")) {
          displayError = "Connection error. Please check your internet.";
        }
        updateById(assistantId, { content: `Error: ${displayError}` });
      } finally {
        setIsLoading(false);
      }
    },
    [streamResponse],
  );

  return { isLoading, sendMessage, cancel, setCallbacks };
}
