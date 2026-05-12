import { useCallback, useRef } from "react";
import { reviewOrchestratorPrompt } from "../../agent/review/reviewPrompt.js";
import { gitDiffTool } from "../../agent/tools/gitDiff/gitDiff.js";
import { ReviewService } from "../../application/reviewService.js";
import type { RunHandle } from "../../lib/runtime/sessionOrchestrator.js";
import { AgentSession } from "../../lib/runtime/agentSession.js";
import { usePRContext } from "../context/PRContext.js";
import { useReviewSessionContext } from "../context/ReviewSessionContext.js";
import { useSubAgentContext } from "../context/SubAgentContext.js";
import { useEvent } from "./useEvent.js";
import { useSubAgentListener } from "./useSubAgentListener.js";

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

  const runHandleRef = useRef<RunHandle | null>(null);
  const serviceRef = useRef<ReviewService | null>(null);
  if (!serviceRef.current) serviceRef.current = new ReviewService();

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

    runHandleRef.current?.cancel();
    runHandleRef.current = null;
    onClearSubAgents();
    onClearBlocks();
    onSetMode("review");

    let prevText = "";

    const { handle } = serviceRef.current!.startReview(
      currentDiff,
      reviewOrchestratorPrompt,
      { gitDiff: gitDiffTool },
      (event) => {
        if (event.type === "text-delta") {
          const delta = event.data.delta;
          prevText = prevText + delta;
          onSetMainOutput(prevText);
          onAddTextBlock(delta);
        } else if (event.type === "tool-call-start") {
          const { toolName, toolArgs } = event.data;
          const toolCallId = event.relatedToolCallId ?? event.data.toolCallId;
          onAddToolCallBlock(toolCallId, toolName, toolArgs);
        } else if (event.type === "tool-call-end") {
          const toolCallId = event.relatedToolCallId ?? event.data.toolCallId;
          const result = event.data.result;
          const status = result?.startsWith("[Error]") ? "error" : "completed";
          onUpdateToolCallBlock(toolCallId, status);
        } else if (event.type === "session-end") {
          onSetMode("results");
        }
      },
    );
    runHandleRef.current = handle;

    try {
      await handle.done;
    } catch (error: any) {
      onSetMainOutput(`Error during review: ${error.message}`);
      onAddTextBlock(`Error during review: ${error.message}`);
    } finally {
      onSetMode("results");
    }
  }, []);

  const cancelReview = useCallback(() => {
    runHandleRef.current?.cancel();
    runHandleRef.current = null;
  }, []);

  const postComment = useCallback(async (): Promise<string> => {
    const pr = selectedPRRef.current;
    const output = mainOutputRef.current;
    if (!pr) return "No PR selected.";
    return serviceRef.current!.postComment(pr.number, output);
  }, []);

  return { startReview, cancelReview, postComment };
}
