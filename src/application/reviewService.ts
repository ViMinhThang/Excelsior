import { startRun } from "./runSession.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/review/spawnSubAgent.js";
import { postPRComment } from "../utils/ghComment.js";
import type { AnyAgentEvent } from "../lib/runtime/events.js";

export class ReviewService {
  startReview(
    diff: string,
    systemPrompt: string,
    extraTools: Record<string, unknown>,
    onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void,
  ) {
    return startRun({
      messages: [
        {
          role: "user",
          content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${diff}\n\`\`\``,
        },
      ],
      createAgent: (runCtx) =>
        createAgent(
          systemPrompt,
          {
            ...extraTools,
            spawnSubAgent: createSpawnSubAgentTool(runCtx.run, runCtx.childRuns),
          },
          runCtx.ctx,
        ),
      onEvent,
    });
  }

  async postComment(prNumber: number, body: string): Promise<string> {
    if (!body) return "No content to post.";
    return postPRComment(prNumber, body);
  }
}
