import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "MODEL_SELECT" | "CREDENTIAL_INPUT" | "PR_LIST";
export type CredentialField = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "DEEPSEEK_API_KEY" | "OPENROUTER_API_KEY" | "GITHUB_TOKEN" | null;
export type NotificationType = "error" | "success" | "info";

export interface Notification {
  message: string;
  type: NotificationType;
}

interface UIState {
  view: View;
  activeTasks: Map<string, string>;
  command: string;
  credentialInput: string;
  credentialField: CredentialField;
  chatResponse: string | null;
  notification: Notification | null;
}

interface UIContextType extends Omit<UIState, "activeTasks"> {
  isLoading: boolean;
  loadingMessage: string;
  setView: (view: View) => void;
  startTask: (id: string, message: string) => void;
  endTask: (id: string) => void;
  setCommand: (command: string) => void;
  setCredentialInput: (value: string) => void;
  setCredentialField: (field: CredentialField) => void;
  setChatResponse: (response: string | null) => void;
  notify: (message: string, type?: NotificationType, duration?: number) => void;
  clearNotification: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("MAIN");
  const [activeTasks, setActiveTasks] = useState<Map<string, string>>(new Map());
  const [command, setCommand] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [credentialField, setCredentialField] = useState<CredentialField>(null);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  const startTask = React.useCallback((id: string, message: string) => {
    setActiveTasks(prev => {
      const next = new Map(prev);
      next.set(id, message);
      return next;
    });
  }, []);

  const endTask = React.useCallback((id: string) => {
    setActiveTasks(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isLoading = activeTasks.size > 0;
  const loadingMessage = [...activeTasks.values()].at(-1) ?? "";

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearNotification = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNotification(null);
  }, []);

  const notify = useCallback(
    (message: string, type: NotificationType = "info", duration?: number) => {
      clearNotification();
      setNotification({ message, type });

      const actualDuration = duration ?? (type === "error" ? 0 : 5000);

      if (actualDuration > 0) {
        timeoutRef.current = setTimeout(() => {
          setNotification(null);
        }, actualDuration);
      }
    },
    [clearNotification]
  );

  const value = useMemo<UIContextType>(
    () => ({
      view,
      isLoading,
      loadingMessage,
      command,
      credentialInput,
      credentialField,
      chatResponse,
      notification,
      setView,
      startTask,
      endTask,
      setCommand,
      setCredentialInput,
      setCredentialField,
      setChatResponse,
      notify,
      clearNotification,
    }),
    [
      view,
      isLoading,
      loadingMessage,
      command,
      credentialInput,
      credentialField,
      chatResponse,
      notification,
      startTask,
      endTask,
      notify,
      clearNotification,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextType {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
