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
import type { PullRequest } from "../core/github-client.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";

export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "MODEL_SELECT" | "CREDENTIAL_INPUT" | "PR_LIST";
export type CredentialField = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "GITHUB_TOKEN" | null;

interface AppState {
  view: View;
  workspace: string;
  statusMessage: string;
  isLoading: boolean;
  loadingMessage: string;
  pullRequests: PullRequest[];
  command: string;
  credentialInput: string;
  credentialField: CredentialField;
  config: Config;
  reviewReport: ReviewReport | null;
  mode: ReviewMode;
}

interface AppContextType extends AppState {
  setView: (view: View) => void;
  setStatusMessage: (message: string) => void;
  setIsLoading: (value: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setPullRequests: (pullRequests: PullRequest[]) => void;
  setCommand: (command: string) => void;
  setCredentialInput: (value: string) => void;
  setCredentialField: (field: CredentialField) => void;
  setConfig: (config: Config) => void;
  refreshConfig: () => void;
  setReviewReport: (report: ReviewReport | null) => void;
  setMode: (mode: ReviewMode) => void;
  showStatus: (message: string, duration?: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("MAIN");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [command, setCommand] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const [credentialField, setCredentialField] = useState<CredentialField>(null);
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);
  const [mode, setMode] = useState<ReviewMode>("ACT");
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showStatus = useCallback((message: string, duration = 4000) => {
    if (statusTimerRef.current !== null) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    setStatusMessage(message);
    if (duration <= 0) {
      return;
    }

    statusTimerRef.current = setTimeout(() => {
      setStatusMessage("");
      statusTimerRef.current = null;
    }, duration);
  }, []);

  const refreshConfig = useCallback(() => {
    setConfig(loadConfig());
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      view,
      workspace: process.cwd(),
      statusMessage,
      isLoading,
      loadingMessage,
      pullRequests,
      command,
      credentialInput,
      credentialField,
      config,
      reviewReport,
      mode,
      setView,
      setStatusMessage,
      setIsLoading,
      setLoadingMessage,
      setPullRequests,
      setCommand,
      setCredentialInput,
      setCredentialField,
      setConfig,
      refreshConfig,
      setReviewReport,
      setMode,
      showStatus,
    }),
    [
      view,
      statusMessage,
      isLoading,
      loadingMessage,
      pullRequests,
      command,
      credentialInput,
      credentialField,
      config,
      reviewReport,
      mode,
      refreshConfig,
      showStatus,
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
