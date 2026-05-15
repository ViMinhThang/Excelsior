import { useCallback } from "react";
import { useAgentHost } from "../context/AgentHostContext.js";

export function useDatabase() {
  const host = useAgentHost();

  const getApiKey = useCallback(() => {
    return host.getSettings().deepseekApiKey;
  }, [host]);

  const saveApiKey = useCallback((key: string) => {
    host.saveSettings({ deepseekApiKey: key });
  }, [host]);

  const getGithubToken = useCallback(() => {
    return host.getSettings().githubToken;
  }, [host]);

  const saveGithubToken = useCallback((token: string) => {
    host.saveSettings({ githubToken: token });
  }, [host]);

  return { getApiKey, saveApiKey, getGithubToken, saveGithubToken };
}
