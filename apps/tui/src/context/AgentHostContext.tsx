import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import {
  getDefaultAgentHost,
  type AgentHost,
} from "@excelsior/agent-host";

const AgentHostContext = createContext<AgentHost | null>(null);

export function AgentHostProvider({
  children,
  host,
}: {
  children: ReactNode;
  host?: AgentHost;
}) {
  const resolvedHost = useMemo(() => host ?? getDefaultAgentHost(), [host]);
  return (
    <AgentHostContext.Provider value={resolvedHost}>
      {children}
    </AgentHostContext.Provider>
  );
}

export function useAgentHost(): AgentHost {
  const host = useContext(AgentHostContext);
  if (!host) throw new Error("useAgentHost must be used within AgentHostProvider");
  return host;
}
