import React, { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { ChatFacade } from "./ui-types.js";

const ChatContext = createContext<ChatFacade | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [command, setCommand] = useState("");

  const value = useMemo<ChatFacade>(
    () => ({
      chatResponse,
      command,
      setChatResponse,
      setCommand,
    }),
    [chatResponse, command]
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatFacade {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}