import { useCallback } from "react";
import { db, getSetting, setSetting } from "../../db/index.js";

export function useDatabase() {
  const getLogs = useCallback((limit: number = 10) => {
    return db
      .prepare("SELECT * FROM observation ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as any[];
  }, []);

  const getApiKey = useCallback(() => {
    return getSetting("DEEPSEEK_API_KEY") || "";
  }, []);

  const saveApiKey = useCallback((key: string) => {
    setSetting("DEEPSEEK_API_KEY", key);
  }, []);

  return { getLogs, getApiKey, saveApiKey };
}
