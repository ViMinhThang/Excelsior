import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { SubAgentState } from "../../lib/eventTypes.js";
import { useManagedSubAgents } from "../hooks/useManagedSubAgents.js";

interface SubAgentContextType {
  subAgents: SubAgentState[];
  selectedSubAgentIndex: number;

  addSubAgent: (agent: SubAgentState) => void;
  updateSubAgent: (toolCallId: string, updates: Partial<SubAgentState>) => void;
  clearSubAgents: () => void;
  selectPrevSubAgent: () => void;
  selectNextSubAgent: () => void;
  focusMainAgent: () => void;
}

const SubAgentContext = createContext<SubAgentContextType | null>(null);

export function SubAgentProvider({ children }: { children: ReactNode }) {
  const {
    subAgents,
    subAgentIndex,
    setSubAgentIndex,
    nextSubAgent,
    prevSubAgent,
    clearSubAgents
  } = useManagedSubAgents();

  // Map new hook members directly back into context's API names
  const addSubAgent = useCallback(() => {}, []); // No-op now handled by listener implicitly!
  const updateSubAgent = useCallback(() => {}, []); // No-op now handled by listener implicitly!

  const focusMainAgent = useCallback(() => {
    setSubAgentIndex(-1); // Main Agent semantic
  }, [setSubAgentIndex]);

  const value = useMemo(() => ({
    subAgents,
    selectedSubAgentIndex: subAgentIndex,
    addSubAgent, // Kept for legacy signature compat
    updateSubAgent, // Kept for legacy signature compat
    clearSubAgents,
    selectPrevSubAgent: prevSubAgent,
    selectNextSubAgent: nextSubAgent,
    focusMainAgent,
  }), [subAgents, subAgentIndex, addSubAgent, updateSubAgent, clearSubAgents, prevSubAgent, nextSubAgent, focusMainAgent]);

  return <SubAgentContext.Provider value={value}>{children}</SubAgentContext.Provider>;
}

export const useSubAgentContext = () => {
  const ctx = useContext(SubAgentContext);
  if (!ctx) throw new Error("useSubAgentContext must be used within SubAgentProvider");
  return ctx;
};
