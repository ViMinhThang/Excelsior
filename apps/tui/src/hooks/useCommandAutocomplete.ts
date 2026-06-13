import { useState, useMemo, useEffect, useCallback } from "react";
import { useAgentHostClient } from "./useAgentHostClient.js";

const MAX_VISIBLE_COMMAND_SUGGESTIONS = 6;

export function useCommandAutocomplete(input: string) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { getCommands } = useAgentHostClient();
  const commands = useMemo(() => getCommands(), [getCommands]);

  const show = input.startsWith("/");
  const query = show ? input.slice(1).split(" ")[0].toLowerCase() : "";

  const filtered = useMemo(() => {
    if (!show) return [];
    return commands.filter((c) => c.name.startsWith(query));
  }, [commands, show, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  const next = useCallback(() => {
    setSelectedIndex((i) => {
      if (filtered.length === 0) return 0;
      return i >= filtered.length - 1 ? 0 : i + 1;
    });
  }, [filtered.length]);

  const prev = useCallback(() => {
    setSelectedIndex((i) => {
      if (filtered.length === 0) return 0;
      return i <= 0 ? filtered.length - 1 : i - 1;
    });
  }, [filtered.length]);

  return {
    show,
    filtered,
    selectedIndex,
    maxVisibleCount: MAX_VISIBLE_COMMAND_SUGGESTIONS,
    next,
    prev,
  };
}
