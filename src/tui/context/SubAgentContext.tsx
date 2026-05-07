import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { SubAgentState } from "../../types.js";

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
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [selectedSubAgentIndex, setSelectedSubAgentIndex] = useState(-1);

  const addSubAgent = useCallback((agent: SubAgentState) => {
    setSubAgents((prev) => [...prev, agent]);
  }, []);

  const updateSubAgent = useCallback((toolCallId: string, updates: Partial<SubAgentState>) => {
    setSubAgents((prev) =>
      prev.map((a) => (a.toolCallId === toolCallId ? { ...a, ...updates } : a)),
    );
  }, []);

  const clearSubAgents = useCallback(() => {
    setSubAgents([]);
    setSelectedSubAgentIndex(-1);
  }, []);

  const selectPrevSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev <= 0) return subAgents.length - 1;
      return prev - 1;
    });
  }, [subAgents.length]);

  const selectNextSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev >= subAgents.length - 1) return 0;
      return prev + 1;
    });
  }, [subAgents.length]);

  const focusMainAgent = useCallback(() => {
    setSelectedSubAgentIndex(-1);
  }, []);

  const value = useMemo(() => ({
    subAgents, selectedSubAgentIndex,
    addSubAgent, updateSubAgent, clearSubAgents,
    selectPrevSubAgent, selectNextSubAgent, focusMainAgent,
  }), [subAgents, selectedSubAgentIndex, addSubAgent, updateSubAgent, clearSubAgents, selectPrevSubAgent, selectNextSubAgent, focusMainAgent]);

  return <SubAgentContext.Provider value={value}>{children}</SubAgentContext.Provider>;
}

export const useSubAgentContext = () => {
  const ctx = useContext(SubAgentContext);
  if (!ctx) throw new Error("useSubAgentContext must be used within SubAgentProvider");
  return ctx;
};
