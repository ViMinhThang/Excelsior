import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "MODEL_SELECT" | "CREDENTIAL_INPUT" | "PR_LIST";
export type CredentialField = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "DEEPSEEK_API_KEY" | "OPENROUTER_API_KEY" | "GITHUB_TOKEN" | null;

interface UIState {
  view: View;
  isLoading: boolean;
  loadingMessage: string;
  command: string;
  credentialInput: string;
  credentialField: CredentialField;
  chatResponse: string | null;
}

interface UIContextType extends UIState {
  setView: (view: View) => void;
  setIsLoading: (value: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setCommand: (command: string) => void;
  setCredentialInput: (value: string) => void;
  setCredentialField: (field: CredentialField) => void;
  setChatResponse: (response: string | null) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("MAIN");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [command, setCommand] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [credentialField, setCredentialField] = useState<CredentialField>(null);
  const [chatResponse, setChatResponse] = useState<string | null>(null);

  const value = useMemo<UIContextType>(
    () => ({
      view,
      isLoading,
      loadingMessage,
      command,
      credentialInput,
      credentialField,
      chatResponse,
      setView,
      setIsLoading,
      setLoadingMessage,
      setCommand,
      setCredentialInput,
      setCredentialField,
      setChatResponse,
    }),
    [
      view,
      isLoading,
      loadingMessage,
      command,
      credentialInput,
      credentialField,
      chatResponse,
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
