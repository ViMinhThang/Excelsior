import { useConfig } from "../context/ConfigContext.js";
import { useUI } from "../context/UIContext.js";
import { useReview } from "../context/ReviewContext.js";
import { registry } from "../app/commands/index.js";
import type { CommandContext } from "../app/commands.js";

export function useCommandContext(extras: {
  loadPullRequests: () => Promise<void>;
  runReview: (prNumber: number) => Promise<void>;
  handlePrompt: (text: string) => Promise<void>;
}): CommandContext {
  const { config, workspace, memory } = useConfig();
  const { 
    setView, 
    notify, 
    startTask, 
    endTask, 
    setChatResponse 
  } = useUI();
  const { setReviewReport, setMode } = useReview();

  return {
    config,
    workspace,
    memory,
    setView,
    notify,
    startTask,
    endTask,
    setChatResponse,
    setReviewReport,
    setMode,
    ...extras,
    getHelpText: () => registry.helpText(),
  };
}
