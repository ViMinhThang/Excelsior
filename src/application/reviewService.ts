import { SessionOrchestrator, RunHandle } from "../lib/runtime/sessionOrchestrator.js";
import { AgentSession } from "../lib/runtime/agentSession.js";
import { AnyAgentEvent } from "../lib/eventTypes.js";
import { createAgent } from "../agent/agent.js";
import { createSpawnSubAgentTool } from "../agent/review/spawnSubAgent.js";
import { postPRComment } from "../utils/ghComment.js";
import { createToolContext } from "../lib/tool/context.js";
import { confirmBus } from "../tui/lib/confirmBus.js";

export class ReviewService {
  private orchestrator = new SessionOrchestrator();

  startReview(
    diff: string,
    systemPrompt: string,
    extraTools: Record<string, unknown>,
    onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void,
  ): { session: AgentSession; childSessions: Map<string, AgentSession>; handle: RunHandle } {
    const session = new AgentSession();
    const childSessions = new Map<string, AgentSession>();

    const abortController = new AbortController();
    session.abortController = abortController;

    const ctx = createToolContext({
      abortSignal: abortController.signal,
      confirmBus,
    });

    const handle = this.orchestrator.startRun(session, {
      messages: [
        {
          role: "user",
          content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${diff}\n\`\`\``,
        },
      ],
      createAgent: () =>
        createAgent(
          systemPrompt,
          {
            ...extraTools,
            spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
          },
          ctx,
        ),
      signal: abortController.signal,
      onEvent,
    });

    return { session, childSessions, handle };
  }

  async postComment(prNumber: number, body: string): Promise<string> {
    if (!body) return "No content to post.";
    return postPRComment(prNumber, body);
  }
}
