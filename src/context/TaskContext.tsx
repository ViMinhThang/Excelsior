import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { TaskFacade } from "./ui-types.js";

const TaskContext = createContext<TaskFacade | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [activeTasks, setActiveTasks] = useState<Map<string, string>>(new Map());

  const isLoading = activeTasks.size > 0;
  const loadingMessage = [...activeTasks.values()].at(-1) ?? "";

  const startTask = useCallback((id: string, message: string) => {
    setActiveTasks(prev => {
      const next = new Map(prev);
      next.set(id, message);
      return next;
    });
  }, []);

  const endTask = useCallback((id: string) => {
    setActiveTasks(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<TaskFacade>(
    () => ({
      isLoading,
      loadingMessage,
      startTask,
      endTask,
    }),
    [isLoading, loadingMessage, startTask, endTask]
  );

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTask(): TaskFacade {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTask must be used within TaskProvider");
  }
  return context;
}