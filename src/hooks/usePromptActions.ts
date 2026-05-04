import { useConfig } from "../context/ConfigContext.js";
import { useChat } from "../context/index.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { useCommandContext } from "./useCommandContext.js";
import { registry } from "../app/commands/index.js";
import { routePrompt } from "../services/router-service.js";
import { runChat } from "../services/chat-service.js";

export function usePromptActions(reviewActions: {
  loadPullRequests: () => Promise<void>;
  runReview: (prNumber: number) => Promise<void>;
}) {
  const { config, workspace, memory } = useConfig();
  const { setChatResponse, setCommand } = useChat();
  const { run } = useAsyncAction();

  async function handlePrompt(promptText: string): Promise<void> {
    await run("Thinking...", async () => {
      setChatResponse(null);

      const route = await routePrompt(promptText, config, workspace, memory);

      if (route.intent === "REVIEW") {
        if (route.prNumber !== undefined) {
          await reviewActions.runReview(route.prNumber);
        } else {
          await reviewActions.loadPullRequests();
        }
      } else {
        memory.addObservation("User", promptText);
        const response = await runChat(promptText, config, workspace, memory);
        memory.addObservation("Assistant", response);
        setChatResponse(response);
      }
    });
  }

  const commandCtx = useCommandContext({
    loadPullRequests: reviewActions.loadPullRequests,
    runReview: reviewActions.runReview,
    handlePrompt,
  });

  async function handleCommandSubmit(value: string): Promise<void> {
    await registry.dispatch(value, commandCtx);
    setCommand("");
  }

  return { handleCommandSubmit, handlePrompt };
}
