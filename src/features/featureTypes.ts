import type { ComponentType } from "react";
import type { Session } from "../lib/runtime/session.js";
import type { Screen } from "../tui/lib/navigationTypes.js";

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string[], context: FeatureRuntimeContext) => Promise<void> | void;
}

export interface FeaturePanelProps {
  context: FeatureRuntimeContext;
}

export interface FeaturePanelDefinition {
  id: string;
  component: ComponentType<FeaturePanelProps>;
}

export interface AppFeature {
  id: string;
  commands: CommandDefinition[];
  panels?: FeaturePanelDefinition[];
}

export interface FeatureRuntimeContext {
  navigate: (screen: Screen) => void;
  goBack: () => void;
  appendMessage: (
    role: "user" | "assistant" | "system",
    content: string,
  ) => void;
  clearMessages: () => void;
  deleteAllSessions: () => void;
  send: (content: string) => void;
  postComment: (prNumber: number, body: string) => Promise<string>;
  switchSession: (sessionId: string) => void;
  createSession: (title?: string) => Session | undefined;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  listSessions: () => Session[];
  sessions: Session[];
  currentSessionId: string | null;
  openPanel: (panelId: string) => void;
  closePanel: () => void;
  getHelpText: () => string;
}
