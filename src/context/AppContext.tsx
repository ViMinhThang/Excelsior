import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { loadConfig, type Config } from "../config.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import { PullRequest } from "../core/github/types.js";

export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "MODEL_SELECT" | "CREDENTIAL_INPUT" | "PR_LIST";
export type CredentialField = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "DEEPSEEK_API_KEY" | "OPENROUTER_API_KEY" | "GITHUB_TOKEN" | null;

interface AppState {
  view: View;
  workspace: string;
  isLoading: boolean;
  loadingMessage: string;
  pullRequests: PullRequest[];
  command: string;
  credentialInput: string;
  credentialField: CredentialField;
  config: Config;
  reviewReport: ReviewReport | null;
  chatResponse: string | null;
  mode: ReviewMode;
  memory: MemoryManager;
}

interface AppContextType extends AppState {
  setView: (view: View) => void;
  setIsLoading: (value: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setPullRequests: (pullRequests: PullRequest[]) => void;
  setCommand: (command: string) => void;
  setCredentialInput: (value: string) => void;
  setCredentialField: (field: CredentialField) => void;
  setConfig: (config: Config) => void;
  refreshConfig: () => void;
  setReviewReport: (report: ReviewReport | null) => void;
  setChatResponse: (response: string | null) => void;
  setMode: (mode: ReviewMode) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children, memory }: { children: ReactNode; memory: MemoryManager }) {
  const [view, setView] = useState<View>("MAIN");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [command, setCommand] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [credentialField, setCredentialField] = useState<CredentialField>(null);
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [mode, setMode] = useState<ReviewMode>("ACT");
  const refreshConfig = useCallback(() => {
    setConfig(loadConfig());
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      view,
      workspace: memory.workspaceRoot,
      isLoading,
      loadingMessage,
      pullRequests,
      command,
      credentialInput,
      credentialField,
      config,
      reviewReport,
      chatResponse,
      mode,
      memory,
      setView,
      setIsLoading,
      setLoadingMessage,
      setPullRequests,
      setCommand,
      setCredentialInput,
      setCredentialField,
      setConfig,
      refreshConfig,
      setReviewReport,
      setChatResponse,
      setMode,
    }),
    [
      view,
      isLoading,
      loadingMessage,
      pullRequests,
      command,
      credentialInput,
      credentialField,
      config,
      reviewReport,
      chatResponse,
      mode,
      memory,
      refreshConfig,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }

  return context;
}
