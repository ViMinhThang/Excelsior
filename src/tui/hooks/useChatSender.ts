import { useCallback, useRef, useState } from "react";
import { Message } from "../../types.js";
import { createAgent } from "../../agent/agent.js";
import { logError } from "../../db/index.js";
import { persistMessage } from "../lib/chatPersistence.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import { spawnSubAgentTool } from "../../agent/review/spawnSubAgent.js";
import { useEvent } from "./useEvent.js";
import { mapMessagesToAIHistory, generateId, formatErrorMessage } from "./useChatSenderUtils.js";

export function useChatSender() {
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const appendRef = useRef<(msg: Message) => void>(() => {});
  const updateByIdRef = useRef<(id: string, updates: Partial<Message>) => void>(() => {});
  const historyRef = useRef<Message[]>([]);

  const setCallbacks = useCallback((deps: {
    append: (msg: Message) => void;
    updateById: (id: string, updates: Partial<Message>) => void;
    messages: Message[];
  }) => {
    appendRef.current = deps.append;
    updateByIdRef.current = deps.updateById;
    historyRef.current = deps.messages;
  }, []);

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
    const history = [...mapMessagesToAIHistory(historyRef.current), { role: "user" as const, content: trimmed }];

    const userMsg: Message = { id: generateId(), role: "user", content: trimmed, timestamp: new Date().toISOString() };
    append(userMsg);
    persistMessage(userMsg);

    let currentId: string | null = null;
    const assistantMessages: Message[] = [];
    const toolMessagesToPersist: Message[] = [];
    let toolBuffer: Array<{ toolCallId: string; toolName: string; toolArgs: string }> = [];
    const toolMap = new Map<string, { msgId: string; toolName: string; toolArgs: string }>();

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const agent = createAgent(undefined, { spawnSubAgent: spawnSubAgentTool });
      await streamAgentResponse(agent, history, {
        onTextDelta: (text) => {
          if (!currentId) {
            currentId = generateId();
            const msg: Message = { id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] };
            append(msg);
            assistantMessages.push(msg);
            toolBuffer = [];
          } else {
            updateById(currentId, { content: text });
            const existing = assistantMessages.find(m => m.id === currentId);
            if (existing) {
              existing.content = text;
            }
          }
        },
        onToolCall: (name, args, callId) => {
          const msgId = generateId();
          const shortArgs = name === "spawnSubAgent"
            ? (() => { try { return JSON.stringify({ role: JSON.parse(args).role }); } catch { return args; } })()
            : args;
          toolMap.set(callId, { msgId, toolName: name, toolArgs: shortArgs });
          const newCall = { toolCallId: callId, toolName: name, toolArgs: shortArgs };
          toolBuffer.push(newCall);

          if (currentId) {
            updateById(currentId, { toolCalls: [newCall] });
            toolBuffer = [];
          }

          currentId = null;
          append({ id: msgId, role: "tool-call", content: shortArgs, timestamp: new Date().toISOString(), toolCall: { toolName: name, toolArgs: shortArgs, toolCallId: callId, status: "pending" } });
        },
        onToolResult: (callId, result) => {
          const info = toolMap.get(callId);
          if (!info) return;
          const isError = result.startsWith("[Error]");
          const displayContent = info.toolName === "spawnSubAgent"
            ? result.split("\n").filter(Boolean).pop() || result
            : result;
          const status = isError ? "error" as const : "completed" as const;
          const toolMsg = { id: info.msgId, role: "tool-call" as const, content: displayContent, timestamp: new Date().toISOString(), toolCall: { toolName: info.toolName, toolArgs: info.toolArgs, toolCallId: callId, status } };
          updateById(info.msgId, toolMsg);
          toolMessagesToPersist.push(toolMsg);
        },
        onFinish: (text, cancelled) => {
          if (!currentId && (text || toolBuffer.length > 0)) {
            currentId = generateId();
            const msg: Message = { id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] };
            append(msg);
            assistantMessages.push(msg);
          }
          const allToPersist = [...assistantMessages, ...toolMessagesToPersist];
          allToPersist.sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : Date.now();
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : Date.now();
            return timeA - timeB;
          });
          allToPersist.forEach(msg => {
            persistMessage(msg);
          });
        },
      }, abortController.signal);
    } catch (error: unknown) {
      const err = error as Error;
      if (err?.name === "AbortError" || err?.message?.includes("abort")) return;
      logError("Agent Error", "[redacted by formatErrorMessage]");
      const displayError = formatErrorMessage(err);
      if (currentId) updateById(currentId, { content: `Error: ${displayError}` });
      else append({ id: `err_${Date.now()}`, role: "assistant", content: `Error: ${displayError}`, timestamp: new Date().toISOString() });
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return { isLoading, sendMessage, cancel, setCallbacks };
}
