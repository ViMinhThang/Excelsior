import { useCallback, useRef } from "react";
import { createAgent } from "../../agent/agent.js";
import { reviewOrchestratorPrompt } from "../../agent/review/reviewPrompt.js";
import {
  spawnSubAgentTool,
} from "../../agent/review/spawnSubAgent.js";
import { gitDiffTool } from "../../agent/tools/gitDiff/gitDiff.js";
import { streamAgentResponse } from "../../lib/agentStream.js";
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

    const mainAgent = createAgent(reviewOrchestratorPrompt, {
      gitDiff: gitDiffTool,
      spawnSubAgent: spawnSubAgentTool,
    });

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    let prevText = "";

    try {
      await streamAgentResponse(
        mainAgent,
        [
          {
            role: "user",
            content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${currentDiff}\n\`\`\``,
          },
        ],
        {
          onTextDelta: (fullText) => {
            const delta = fullText.slice(prevText.length);
            prevText = fullText;
            onSetMainOutput(fullText);
            onAddTextBlock(delta);
          },
          onToolCall: (toolName, args, toolCallId) => {
            onAddToolCallBlock(toolCallId, toolName, args);
          },
          onToolResult: (toolCallId, result) => {
            onUpdateToolCallBlock(toolCallId, result.startsWith("[Error]") ? "error" : "completed");
          },
          onFinish: (text, cancelled) => {
            if (cancelled) {
              onSetMainOutput(text + "\n\n[Cancelled]");
            }
            onSetMode("results");
          },
        },
        signal,
      );
    } catch (error: any) {
      onSetMainOutput(`Error during review: ${error.message}`);
      onAddTextBlock(`Error during review: ${error.message}`);
    } finally {
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
