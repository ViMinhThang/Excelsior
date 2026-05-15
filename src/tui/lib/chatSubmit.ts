import type { FeatureRuntimeContext } from "../../features/featureTypes.js";
import { handleCommand as defaultHandleCommand } from "./commands.js";
import { getSubmittedCommand } from "./commandSubmission.js";

export interface FeatureRuntimeContextDeps {
  navigate: FeatureRuntimeContext["navigate"];
  goBack: FeatureRuntimeContext["goBack"];
  setCommandResult: (content: string | null) => void;
  clear: () => void;
  deleteAllSessions: () => void;
  resetInput: () => void;
  send: (content: string, options?: { displayContent?: string; silent?: boolean }) => void;
  postComment: FeatureRuntimeContext["postComment"];
  switchSession: FeatureRuntimeContext["switchSession"];
  createSession: FeatureRuntimeContext["createSession"];
  deleteSession: FeatureRuntimeContext["deleteSession"];
  renameSession: FeatureRuntimeContext["renameSession"];
  listSessions: FeatureRuntimeContext["listSessions"];
  sessions: FeatureRuntimeContext["sessions"];
  currentSessionId: string | null;
  openPanel: FeatureRuntimeContext["openPanel"];
  closePanel: FeatureRuntimeContext["closePanel"];
  getHelpText: FeatureRuntimeContext["getHelpText"];
  mode: FeatureRuntimeContext["mode"];
  setMode: FeatureRuntimeContext["setMode"];
  toggleMode: FeatureRuntimeContext["toggleMode"];
}

export interface SubmitChatInputDeps {
  input: string;
  isLoading: boolean;
  commandContext: FeatureRuntimeContext;
  resetInput: () => void;
  setInput: (value: string) => void;
  send: (content: string) => void;
  handleCommand?: typeof defaultHandleCommand;
}

export function createFeatureRuntimeContext(
  deps: FeatureRuntimeContextDeps,
): FeatureRuntimeContext {
  return {
    navigate: deps.navigate,
    goBack: deps.goBack,
    appendMessage: (_role, content) => deps.setCommandResult(content),
    clearMessages: () => {
      deps.clear();
      deps.setCommandResult(null);
    },
    deleteAllSessions: deps.deleteAllSessions,
    send: (content, options) => {
      deps.resetInput();
      deps.send(content, options);
    },
    postComment: deps.postComment,
    switchSession: deps.switchSession,
    createSession: deps.createSession,
    deleteSession: deps.deleteSession,
    renameSession: deps.renameSession,
    listSessions: deps.listSessions,
    sessions: deps.sessions,
    currentSessionId: deps.currentSessionId,
    openPanel: deps.openPanel,
    closePanel: deps.closePanel,
    getHelpText: deps.getHelpText,
    mode: deps.mode,
    setMode: deps.setMode,
    toggleMode: deps.toggleMode,
  };
}

export function submitChatInput(deps: SubmitChatInputDeps): void {
  if (deps.isLoading) return;
  const trimmed = deps.input.trim();
  if (!trimmed) return;

  const command = getSubmittedCommand(trimmed);
  if (command) {
    const handleCommand = deps.handleCommand ?? defaultHandleCommand;
    handleCommand(command, deps.commandContext).then((isCommand) => {
      if (isCommand) deps.setInput("");
    });
    return;
  }

  deps.resetInput();
  deps.send(trimmed);
}
