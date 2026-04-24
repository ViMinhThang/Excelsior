import React, { createContext, useContext, useState, ReactNode } from "react";
import { PullRequest } from "../core/github-client.js";

export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "API_KEY_INPUT" | "GITHUB_TOKEN_INPUT" | "PR_LIST";

interface AppState {
  view: View;
  workspace: string;
  statusMessage: string;
  isLoading: boolean;
  loadingMessage: string;
  pullRequests: PullRequest[];
  command: string;
  apiKey: string;
  mode: "ACT" | "PLAN";
}

interface AppContextType extends AppState {
  setView: (view: View) => void;
  setWorkspace: (path: string) => void;
  setStatusMessage: (msg: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingMessage: (msg: string) => void;
  setPullRequests: (prs: PullRequest[]) => void;
  setCommand: (cmd: string) => void;
  setApiKey: (key: string) => void;
  setMode: (mode: "ACT" | "PLAN") => void;
  showStatus: (msg: string, duration?: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [view, setView] = useState<View>("MAIN");
  const [workspace, setWorkspace] = useState(process.cwd());
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [command, setCommand] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<"ACT" | "PLAN">("ACT");

  const showStatus = (msg: string, duration: number = 3000) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), duration);
  };

  const value = {
    view, setView,
    workspace, setWorkspace,
    statusMessage, setStatusMessage,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    pullRequests, setPullRequests,
    command, setCommand,
    apiKey, setApiKey,
    mode, setMode,
    showStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
