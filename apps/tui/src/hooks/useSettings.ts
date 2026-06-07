import { useCallback } from "react";
import { useAgentHost } from "../context/AgentHostContext.js";

export function useSettings() {
  const host = useAgentHost();

  const getApiKey = useCallback(() => {
    return host.getCatalog().settings.deepseekApiKey;
  }, [host]);

  const saveApiKey = useCallback((key: string) => {
    void host.dispatch({ type: "save-settings", settings: { deepseekApiKey: key } });
  }, [host]);

  const getGithubToken = useCallback(() => {
    return host.getCatalog().settings.githubToken;
  }, [host]);

  const saveGithubToken = useCallback((token: string) => {
    void host.dispatch({ type: "save-settings", settings: { githubToken: token } });
  }, [host]);

  return { getApiKey, saveApiKey, getGithubToken, saveGithubToken };
}
