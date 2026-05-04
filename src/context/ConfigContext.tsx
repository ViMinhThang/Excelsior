import React, { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from "react";
import { loadConfig, type Config } from "../infra/config.js";
import type { MemoryManager } from "../mem/memory-manager.js";

interface ConfigState {
  config: Config;
  workspace: string;
  memory: MemoryManager;
}

interface ConfigContextType extends ConfigState {
  setConfig: (config: Config) => void;
  refreshConfig: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children, memory }: { children: ReactNode; memory: MemoryManager }) {
  const [config, setConfig] = useState<Config>(() => loadConfig());

  const refreshConfig = useCallback(() => {
    setConfig(loadConfig());
  }, []);

  const value = useMemo<ConfigContextType>(
    () => ({
      config,
      workspace: memory.workspaceRoot,
      memory,
      setConfig,
      refreshConfig,
    }),
    [config, memory, refreshConfig]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
