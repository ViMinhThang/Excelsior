import { useCallback, useRef, useState } from "react";
import { Message } from "../../types.js";
import { createAgent } from "../../agent/agent.js";
import { logError } from "../../db/index.js";
import { persistMessage } from "../lib/chatPersistence.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import {
  mapMessagesToAIHistory,
  generateId,
  formatErrorMessage,
  createStreamCallbacks,
} from "./useChatSenderUtils.js";

export function useChatSender() {
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const appendRef = useRef<(msg: Message) => void>(() => {});
  const updateByIdRef = useRef<(id: string, updates: Partial<Message>) => void>(
    () => {},
  );
  const historyRef = useRef<Message[]>([]);

  const setCallbacks = useCallback(
    (deps: {
      append: (msg: Message) => void;
      updateById: (id: string, updates: Partial<Message>) => void;
      messages: Message[];
    }) => {
      appendRef.current = deps.append;
      updateByIdRef.current = deps.updateById;
      historyRef.current = deps.messages;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (isLoadingRef.current) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    setIsLoading(true);
    cancelledRef.current = false;

    const append = appendRef.current;
    const updateById = updateByIdRef.current;
    const history = [
      ...mapMessagesToAIHistory(historyRef.current),
      { role: "user" as const, content: trimmed },
    ];

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    append(userMsg);
    persistMessage(userMsg);

    const abortController = new AbortController();
    abortRef.current = abortController;

    const streamHandler = createStreamCallbacks({ append, updateById });

    try {
      const agent = createAgent();
      await streamAgentResponse(
        agent,
        history,
        streamHandler.callbacks,
        abortController.signal,
      );
    } catch (error: unknown) {
      const err = error as Error;
      if (err?.name === "AbortError" || err?.message?.includes("abort")) return;
      logError("Agent Error", "[redacted by formatErrorMessage]");
      const displayError = formatErrorMessage(err);
      const currentId = streamHandler.getCurrentId();
      if (currentId)
        updateById(currentId, { content: `Error: ${displayError}` });
      else
        append({
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `Error: ${displayError}`,
          timestamp: new Date().toISOString(),
        });
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return { isLoading, sendMessage, cancel, setCallbacks };
}
