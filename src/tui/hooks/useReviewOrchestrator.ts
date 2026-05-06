import { useCallback, useEffect, useRef } from "react";
import { createAgent } from "../../agent/agent.js";
import { reviewOrchestratorPrompt } from "../../agent/review/reviewPrompt.js";
import {
  spawnSubAgentTool,
  subAgentRegistry,
} from "../../agent/review/spawnSubAgent.js";
import { gitDiffTool } from "../../agent/tools/gitDiff/gitDiff.js";
import { useReviewContext } from "../context/ReviewContext.js";
import { postPRComment } from "../../utils/ghComment.js";

export function useReviewOrchestrator() {
  const {
    diff,
    selectedPR,
    mainOutput,
    addSubAgent,
    updateSubAgent,
    clearSubAgents,
    setMainOutput,
    setMode,
  } = useReviewContext();

  const addSubAgentRef = useRef(addSubAgent);
  addSubAgentRef.current = addSubAgent;
  const updateSubAgentRef = useRef(updateSubAgent);
  updateSubAgentRef.current = updateSubAgent;
  const clearSubAgentsRef = useRef(clearSubAgents);
  clearSubAgentsRef.current = clearSubAgents;
  const setMainOutputRef = useRef(setMainOutput);
  setMainOutputRef.current = setMainOutput;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const diffRef = useRef(diff);
  diffRef.current = diff;
  const selectedPRRef = useRef(selectedPR);
  selectedPRRef.current = selectedPR;
  const mainOutputRef = useRef(mainOutput);
  mainOutputRef.current = mainOutput;

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    subAgentRegistry.onSpawned = ({ toolCallId, role }) => {
      addSubAgentRef.current({
        toolCallId,
        role,
        status: "running",
        latestLine: "",
        fullOutput: "",
      });
    };
    subAgentRegistry.onOutput = ({ toolCallId, latestLine, fullOutput }) => {
      updateSubAgentRef.current(toolCallId, { status: "running", latestLine, fullOutput });
    };
    subAgentRegistry.onDone = ({ toolCallId, fullOutput }) => {
      updateSubAgentRef.current(toolCallId, {
        status: "done",
        latestLine: fullOutput.split("\n").filter(Boolean).pop() || "",
        fullOutput,
      });
    };
    return () => {
      subAgentRegistry.onSpawned = null;
      subAgentRegistry.onOutput = null;
      subAgentRegistry.onDone = null;
    };
  }, []);

  const startReview = useCallback(async () => {
    const currentDiff = diffRef.current;
    if (!currentDiff) return;

    clearSubAgentsRef.current();
    setModeRef.current("review");

    const mainAgent = createAgent(reviewOrchestratorPrompt, {
      gitDiff: gitDiffTool,
      spawnSubAgent: spawnSubAgentTool,
    });

    abortRef.current = new AbortController();
    let fullText = "";

    try {
      const stream = await mainAgent.stream({
        messages: [
          {
            role: "user",
            content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${currentDiff}\n\`\`\``,
          },
        ],
      });

      for await (const part of stream.fullStream) {
        if (abortRef.current?.signal.aborted) break;
        if (part.type === "text-delta") {
          const delta = (part as any).text ?? (part as any).textDelta ?? "";
          fullText += delta;
          setMainOutputRef.current(fullText);
        }
      }
    } catch (error: any) {
      setMainOutputRef.current(`Error during review: ${error.message}`);
    } finally {
      setModeRef.current("results");
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
