import { useAppContext } from "../context/AppContext.js";
import { formatHelpText, parseCommand } from "../app/commands.js";
import { routePrompt } from "../services/router-service.js";
import { runChat } from "../services/chat-service.js";

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
    const parsed = parseCommand(value);

    switch (parsed.type) {
      case "list-prs":
        await reviewActions.loadPullRequests();
        break;
      case "review-pr":
        if (parsed.prNumber !== undefined) {
          await reviewActions.runReview(parsed.prNumber);
        } else {
          await reviewActions.loadPullRequests();
        }
        break;
      case "open-settings":
        setView("SETTINGS");
        break;
      case "show-help":
        showStatus(formatHelpText(), 8000);
        break;
      case "prompt":
        await handlePrompt(parsed.text);
        break;
      case "unknown":
        showStatus(`Unknown command: ${parsed.raw}`, 8000);
        break;
    }

    setCommand("");
  }

  return { handleCommandSubmit, handlePrompt };
}
