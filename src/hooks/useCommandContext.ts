import { useConfig } from "../context/ConfigContext.js";
import { useNavigation, useTask, useNotification, useChat } from "../context/index.js";
import { useReview } from "../context/ReviewContext.js";
import { registry } from "../app/commands/index.js";
import type { CommandDeps } from "../app/contexts.js";

export function useCommandContext(extras: {
  loadPullRequests: () => Promise<void>;
  runReview: (prNumber: number) => Promise<void>;
  handlePrompt: (text: string) => Promise<void>;
}): CommandDeps {
  const { config, workspace, memory } = useConfig();
  const { setView } = useNavigation();
  const { startTask, endTask } = useTask();
  const { notify } = useNotification();
  const { setChatResponse } = useChat();
  const { setMode } = useReview();

  return {
    data: { config, workspace, memory },
    ui: { setView, setChatResponse, setMode, notify },
    tasks: { startTask, endTask },
    actions: {
      loadPullRequests: extras.loadPullRequests,
      runReview: extras.runReview,
      handlePrompt: extras.handlePrompt,
      getHelpText: () => registry.helpText(),
    },
  };
}
