import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { ReviewScreenMode } from "../../types.js";

export type ReviewBlock =
  | { type: "text"; text: string }
  | { type: "subagent"; toolCallId: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; toolArgs: string; status: "pending" | "completed" | "error" };

interface ReviewSessionContextType {
  mode: ReviewScreenMode;
  subMode: "overview" | "detail";
  mainOutput: string;
  blocks: ReviewBlock[];

  setMode: (mode: ReviewScreenMode) => void;
  setSubMode: (subMode: "overview" | "detail") => void;
  setMainOutput: (output: string) => void;
  addTextBlock: (text: string) => void;
  addSubAgentBlock: (toolCallId: string) => void;
  addToolCallBlock: (toolCallId: string, toolName: string, toolArgs: string) => void;
  updateToolCallBlock: (toolCallId: string, status: "pending" | "completed" | "error") => void;
  clearBlocks: () => void;
}

const ReviewSessionContext = createContext<ReviewSessionContextType | null>(null);

export function ReviewSessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewScreenMode>("browser");
  const [subMode, setSubMode] = useState<"overview" | "detail">("overview");
  const [mainOutput, setMainOutput] = useState("");
  const [blocks, setBlocks] = useState<ReviewBlock[]>([]);

  const addTextBlock = useCallback((text: string) => {
    setBlocks((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].type !== "text") {
        return [...prev, { type: "text", text }];
      }
      const updated = [...prev];
      const last = updated[updated.length - 1] as { type: "text"; text: string };
      updated[updated.length - 1] = { type: "text", text: last.text + text };
      return updated;
    });
  }, []);

  const addSubAgentBlock = useCallback((toolCallId: string) => {
    setBlocks((prev) => [...prev, { type: "subagent", toolCallId }]);
  }, []);

  const addToolCallBlock = useCallback((toolCallId: string, toolName: string, toolArgs: string) => {
    setBlocks((prev) => [...prev, { type: "tool-call", toolCallId, toolName, toolArgs, status: "pending" }]);
  }, []);

  const updateToolCallBlock = useCallback((toolCallId: string, status: "pending" | "completed" | "error") => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.type === "tool-call" && b.toolCallId === toolCallId ? { ...b, status } : b,
      ),
    );
  }, []);

  const clearBlocks = useCallback(() => {
    setBlocks([]);
  }, []);

  const value = useMemo(() => ({
    mode, subMode, mainOutput, blocks,
    setMode, setSubMode, setMainOutput,
    addTextBlock, addSubAgentBlock, addToolCallBlock, updateToolCallBlock, clearBlocks,
  }), [mode, subMode, mainOutput, blocks, addTextBlock, addSubAgentBlock, addToolCallBlock, updateToolCallBlock, clearBlocks]);

  return <ReviewSessionContext.Provider value={value}>{children}</ReviewSessionContext.Provider>;
}

export const useReviewSessionContext = () => {
  const ctx = useContext(ReviewSessionContext);
  if (!ctx) throw new Error("useReviewSessionContext must be used within ReviewSessionProvider");
  return ctx;
};
