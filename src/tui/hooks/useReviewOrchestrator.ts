import { useCallback, useRef } from "react";
import { createAgent } from "../../agent/agent.js";
import { reviewOrchestratorPrompt } from "../../agent/review/reviewPrompt.js";
import { createSpawnSubAgentTool } from "../../agent/review/spawnSubAgent.js";
import { gitDiffTool } from "../../agent/tools/gitDiff/gitDiff.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
import { AgentSession } from "../../lib/agentSession.js";
import { usePRContext } from "../context/PRContext.js";
import { useReviewSessionContext } from "../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../context/SubAgentContext.js";
import { useEvent } from "./useEvent.js";
import { useSubAgentListener } from "./useSubAgentListener.js";
import { postPRComment } from "../../utils/ghComment.js";

export function useReviewOrchestrator() {
  const { diff, selectedPR } = usePRContext();
  const { mainOutput, setMainOutput, setMode, addTextBlock, addSubAgentBlock, addToolCallBlock, updateToolCallBlock, clearBlocks } = useReviewSessionContext();
  const { addSubAgent, updateSubAgent, clearSubAgents } = useSubAgentContext();

  const onAddSubAgent = useEvent(addSubAgent);
  const onUpdateSubAgent = useEvent(updateSubAgent);
  const onClearSubAgents = useEvent(clearSubAgents);
  const onAddSubAgentBlock = useEvent(addSubAgentBlock);
  const onSetMainOutput = useEvent(setMainOutput);
  const onSetMode = useEvent(setMode);
  const onAddTextBlock = useEvent(addTextBlock);
  const onAddToolCallBlock = useEvent(addToolCallBlock);
  const onUpdateToolCallBlock = useEvent(updateToolCallBlock);
  const onClearBlocks = useEvent(clearBlocks);

  const diffRef = useRef(diff);
  diffRef.current = diff;
  const selectedPRRef = useRef(selectedPR);
  selectedPRRef.current = selectedPR;
  const mainOutputRef = useRef(mainOutput);
  mainOutputRef.current = mainOutput;

  const abortRef = useRef<AbortController | null>(null);
  const childSessionsRef = useRef(new Map<string, AgentSession>());

  useSubAgentListener({
    onSpawned: (agent) => {
      onAddSubAgent(agent);
      onAddSubAgentBlock(agent.toolCallId);
    },
    onOutput: (toolCallId, updates) => {
      onUpdateSubAgent(toolCallId, { status: "running", ...updates });
    },
    onDone: (toolCallId, fullOutput) => {
      onUpdateSubAgent(toolCallId, {
        status: "done",
        latestLine: fullOutput.split("\n").filter(Boolean).pop() || "",
        fullOutput,
      });
    },
  });

  const startReview = useCallback(async () => {
    const currentDiff = diffRef.current;
    if (!currentDiff) return;

    abortRef.current?.abort();
    onClearSubAgents();
    onClearBlocks();
    onSetMode("review");

    const childSessions = childSessionsRef.current;
    childSessions.clear();

    const session = new AgentSession();
    const abortController = new AbortController();
    abortRef.current = abortController;
    session.abortController = abortController;

    const mainAgent = createAgent(reviewOrchestratorPrompt, {
      gitDiff: gitDiffTool,
      spawnSubAgent: createSpawnSubAgentTool(session, childSessions),
    });

    let prevText = "";

    const unsub = session.bus.on("event", (event) => {
      if (event.type === "text-delta") {
        const fullText = prevText + (event.data.delta as string);
        const delta = (event.data.delta as string);
        prevText = fullText;
        onSetMainOutput(fullText);
        onAddTextBlock(delta);
      } else if (event.type === "tool-call-start") {
        const toolName = event.data.toolName as string;
        const args = event.data.toolArgs as string;
        const toolCallId = event.relatedToolCallId ?? (event.data.toolCallId as string);
        onAddToolCallBlock(toolCallId, toolName, args);
      } else if (event.type === "tool-call-end") {
        const toolCallId = event.relatedToolCallId ?? (event.data.toolCallId as string);
        const result = event.data.result as string;
        const status = result?.startsWith("[Error]") ? "error" : "completed";
        onUpdateToolCallBlock(toolCallId, status);
      } else if (event.type === "session-end") {
        onSetMode("results");
      }
    });

    try {
      await streamAgentResponse(
        mainAgent,
        [
          {
            role: "user",
            content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${currentDiff}\n\`\`\``,
          },
        ],
        session,
        abortController.signal,
      );
    } catch (error: any) {
      onSetMainOutput(`Error during review: ${error.message}`);
      onAddTextBlock(`Error during review: ${error.message}`);
    } finally {
      unsub();
      childSessions.clear();
      onSetMode("results");
    }
  }, []);

  const cancelReview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const postComment = useCallback(async (): Promise<string> => {
    const pr = selectedPRRef.current;
    const output = mainOutputRef.current;
    if (!pr || !output) return "No content to post.";
    return postPRComment(pr.number, output);
  }, []);

  return { startReview, cancelReview, postComment };
}
