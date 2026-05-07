import { useState, useCallback, useRef } from "react";
import { Message, PAGE_SIZE } from "../../types.js";
import { loadMessages, getMessageCount, persistMessage } from "../lib/chatPersistence.js";
import { generateId } from "./useChatSenderUtils.js";

export function useChatHistory() {
  const totalRef = useRef(getMessageCount());
  const loadedRef = useRef(0);

  const [messages, setMessages] = useState<Message[]>(() => {
    const initial = loadMessages(PAGE_SIZE, 0);
    loadedRef.current = initial.length;
    return initial;
  });

  const [hasMore, setHasMore] = useState(
    () => loadedRef.current < totalRef.current,
  );

  const append = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateById = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
  }, []);

  const createAndAppend = useCallback(
    (role: Message["role"], content: string, extra?: Partial<Message>) => {
      const msg: Message = {
        id: generateId(),
        role,
        content,
        timestamp: new Date().toISOString(),
        ...extra,
      };
      append(msg);
      return msg;
    },
    [append],
  );

  const loadMore = useCallback((count: number = PAGE_SIZE) => {
    const older = loadMessages(count, loadedRef.current);
    if (older.length > 0) {
      loadedRef.current += older.length;
      totalRef.current = getMessageCount();
      setHasMore(loadedRef.current < totalRef.current);
      setMessages((prev) => [...older, ...prev]);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    loadedRef.current = 0;
    totalRef.current = 0;
    setHasMore(false);
  }, []);

  return {
    messages,
    hasMore,
    append,
    updateById,
    createAndAppend,
    loadMore,
    clearMessages,
  };
}
