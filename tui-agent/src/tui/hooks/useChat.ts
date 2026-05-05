import { useState, useCallback } from "react";
import { logObservation, db, logError } from "../../db/index.js";
import { createAgent } from "../../agent/agent.js";
import { handleCommand } from "../../agent/commands/registry.js";

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: string;
}

export const useChat = (navigate: (s: any) => void, goBack: () => void) => {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const logs = db
      .prepare(
        "SELECT role, content, timestamp FROM observation ORDER BY timestamp ASC",
      )
      .all() as any[];
    return logs.map((log) => ({
      role: log.role,
      content: log.content,
      timestamp: log.timestamp,
    }));
  });

  const appendMessage = useCallback(
    (role: Message["role"], content: string) => {
      if (!content && role !== "assistant") return; // Don't log empty messages except assistant (placeholder)
      const timestamp = new Date().toISOString();
      logObservation(role, content);
      setMessages((prev) => [...prev, { role, content, timestamp }]);
    },
    [],
  );

  const updateLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0 || prev[lastIndex].role !== "assistant") return prev;

      const newMessages = [...prev];
      newMessages[lastIndex] = { ...newMessages[lastIndex], content };
      return newMessages;
    });
  }, []);

  const processStream = useCallback(
    async (stream: any) => {
      let fullContent = "";
      for await (const part of stream.fullStream) {
        switch (part.type) {
          case "text-delta":
            fullContent += (part as any).text || (part as any).textDelta || "";
            updateLastAssistantMessage(fullContent);
            break;
          case "tool-result":
            const result = JSON.stringify(
              (part as any).result ?? "No result returned",
            );
            appendMessage("tool", result);
            break;
          case "tool-call":
            // Optionally handle tool calls here (e.g. show status)
            break;
        }
      }
      return fullContent;
    },
    [appendMessage, updateLastAssistantMessage],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const isCommand = await handleCommand(trimmed, {
        navigate,
        goBack,
        appendMessage,
        setMessages,
      });

      if (isCommand) return;

      setIsLoading(true);
      appendMessage("user", trimmed);

      try {
        // Prepare assistant placeholder
        const timestamp = new Date().toISOString();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", timestamp },
        ]);

        const agent = createAgent();
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        history.push({ role: "user", content: trimmed });

        const stream = await agent.stream({ messages: history as any });
        const fullContent = await processStream(stream);

        if (fullContent) {
          logObservation("assistant", fullContent);
        }
      } catch (error: any) {
        logError(`Agent Error: ${error.message}`, error.stack);

        let displayError = error.message;
        if (
          error.message.includes("401") ||
          error.message.includes("API key")
        ) {
          displayError =
            "Invalid or missing API key. Please check your settings (ctrl+s).";
        } else if (error.message.includes("fetch")) {
          displayError = "Connection error. Please check your internet.";
        }

        appendMessage("assistant", `Error: ${displayError}`);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, navigate, goBack, appendMessage, processStream],
  );

  return {
    messages,
    isLoading,
    sendMessage,
  };
};
