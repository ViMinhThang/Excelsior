import { useCallback } from "react";
import { getSetting, setSetting } from "../../lib/persistence/db.js";

export function useDatabase() {
  const getApiKey = useCallback(() => {
    return getSetting("DEEPSEEK_API_KEY") || "";
  }, []);

  const saveApiKey = useCallback((key: string) => {
    setSetting("DEEPSEEK_API_KEY", key);
  }, []);

  const getGithubToken = useCallback(() => {
    return getSetting("GITHUB_TOKEN") || "";
  }, []);

  const saveGithubToken = useCallback((token: string) => {
    setSetting("GITHUB_TOKEN", token);
  }, []);

  return { getApiKey, saveApiKey, getGithubToken, saveGithubToken };
}
