import { useAppContext } from "../context/AppContext.js";
import { registry } from "../app/commands/index.js";
import { routePrompt } from "../services/router-service.js";
import { runChat } from "../services/chat-service.js";
import type { CommandContext } from "../app/commands.js";

export function usePromptActions(reviewActions: {
  loadPullRequests: () => Promise<void>;
  runReview: (prNumber: number) => Promise<void>;
}) {
  const {
    config,
    setIsLoading,
    setLoadingMessage,
    setChatResponse,
    setReviewReport,
    showStatus,
    setView,
    setCommand,
    setMode,
    workspace,
    memory,
  } = useAppContext();

  async function handlePrompt(promptText: string): Promise<void> {
    setChatResponse(null);
    setReviewReport(null);
    setIsLoading(true);
    setLoadingMessage("Thinking...");

    try {
      const route = await routePrompt(promptText, config, workspace, memory);

      if (route.intent === "REVIEW") {
        if (route.prNumber !== undefined) {
          await reviewActions.runReview(route.prNumber);
        } else {
          await reviewActions.loadPullRequests();
        }
      } else {
        setLoadingMessage("Generating response...");
        const response = await runChat(promptText, config, workspace, memory);
        setChatResponse(response);
      }
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 8000);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCommandSubmit(value: string): Promise<void> {
    const ctx: CommandContext = {
      config,
      workspace,
      memory,
      setView,
      showStatus,
      setIsLoading,
      setLoadingMessage,
      setChatResponse,
      setReviewReport,
      setMode,
      loadPullRequests: reviewActions.loadPullRequests,
      runReview: reviewActions.runReview,
      handlePrompt,
      getHelpText: () => registry.helpText(),
    };

    await registry.dispatch(value, ctx);
    setCommand("");
  }

  return { handleCommandSubmit, handlePrompt };
}
