import { Message } from "../../types.js";
import { createToolDisplay } from "../lib/toolDisplay.js";
import { persistMessage } from "../lib/chatPersistence.js";

function formatToolHistoryMessage(message: Message): string {
  const display = createToolDisplay({
    toolName: message.toolCall?.toolName,
    toolArgs: message.toolCall?.toolArgs,
    status: message.toolCall?.status,
    content: message.content,
  });

  const preview = display.resultPreview?.length
    ? `\n${display.resultPreview.map((line) => `  ${line}`).join("\n")}`
    : "";
  const omitted = display.omittedResultLines
    ? `\n  ... ${display.omittedResultLines} more line${display.omittedResultLines === 1 ? "" : "s"}`
    : "";
  const detail = display.detail ? ` (${display.detail})` : "";

  return `[Tool ${display.tone}: ${display.label} - ${display.summary}${detail}]${preview}${omitted}`;
}

export function mapMessagesToAIHistory(messages: Message[]): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const result: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      result.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      result.push({ role: "assistant", content: m.content });
    } else if (m.role === "tool-call" && m.toolCall) {
      result.push({ role: "assistant", content: formatToolHistoryMessage(m) });
    } else {
      result.push({ role: "user", content: m.content });
    }
  }
  return result;
}

export function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
];

function sanitizeMessage(msg: string): string {
  let sanitized = msg;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function formatErrorMessage(error: Error & { message: string }): string {
  const msg = sanitizeMessage(error.message);
  if (msg.includes("401") || msg.includes("API key") || msg.includes("api key") || msg.includes("apikey")) {
    return "Invalid or missing API key. Please check your settings (ctrl+s).";
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
    return "Connection error. Please check your internet.";
  }
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Rate limit exceeded. Please wait before retrying.";
  }
  if (msg.includes("402") || msg.includes("insufficient") || msg.includes("quota") || msg.includes("balance")) {
    return "API quota or balance insufficient.";
  }
  return "An unexpected error occurred. Please try again.";
}

interface StreamContext {
  append: (msg: Message) => void;
  updateById: (id: string, updates: Partial<Message>) => void;
}

export function createStreamCallbacks(context: StreamContext) {
  let currentId: string | null = null;
  const assistantMessages: Message[] = [];
  const toolMessagesToPersist: Message[] = [];
  let toolBuffer: Array<{ toolCallId: string; toolName: string; toolArgs: string }> = [];
  const toolMap = new Map<string, { msgId: string; toolName: string; toolArgs: string }>();

  return {
    getAssistantMessages: () => assistantMessages,
    getToolMessagesToPersist: () => toolMessagesToPersist,
    getCurrentId: () => currentId,
    
    callbacks: {
      onTextDelta: (text: string) => {
        if (!currentId) {
          currentId = generateId();
          const msg: Message = { id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] };
          context.append(msg);
          assistantMessages.push(msg);
          toolBuffer = [];
        } else {
          context.updateById(currentId, { content: text });
          const existing = assistantMessages.find(m => m.id === currentId);
          if (existing) {
            existing.content = text;
          }
        }
      },
      onToolCall: (name: string, args: string, callId: string) => {
        const msgId = generateId();
        const shortArgs = name === "spawnSubAgent"
          ? (() => { try { return JSON.stringify({ role: JSON.parse(args).role }); } catch { return args; } })()
          : args;
        toolMap.set(callId, { msgId, toolName: name, toolArgs: shortArgs });
        const newCall = { toolCallId: callId, toolName: name, toolArgs: shortArgs };
        toolBuffer.push(newCall);

        if (currentId) {
          context.updateById(currentId, { toolCalls: [newCall] });
          toolBuffer = [];
        }

        currentId = null;
        context.append({
          id: msgId,
          role: "tool-call",
          content: shortArgs,
          timestamp: new Date().toISOString(),
          toolCall: { toolName: name, toolArgs: shortArgs, toolCallId: callId, status: "pending" }
        });
      },
      onToolResult: (callId: string, result: string) => {
        const info = toolMap.get(callId);
        if (!info) return;
        const isError = result.startsWith("[Error]");
        const displayContent = info.toolName === "spawnSubAgent"
          ? result.split("\n").filter(Boolean).pop() || result
          : result;
        const status = isError ? "error" as const : "completed" as const;
        const toolMsg = {
          id: info.msgId,
          role: "tool-call" as const,
          content: displayContent,
          timestamp: new Date().toISOString(),
          toolCall: { toolName: info.toolName, toolArgs: info.toolArgs, toolCallId: callId, status }
        };
        context.updateById(info.msgId, toolMsg);
        toolMessagesToPersist.push(toolMsg);
      },
      onFinish: (text: string) => {
        if (!currentId && (text || toolBuffer.length > 0)) {
          currentId = generateId();
          const msg: Message = { id: currentId, role: "assistant", content: text, timestamp: new Date().toISOString(), toolCalls: [...toolBuffer] };
          context.append(msg);
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
      }
    }
  };
}
