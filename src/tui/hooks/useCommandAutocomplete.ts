import { useState, useMemo, useEffect, useCallback } from "react";
import { commands } from "../../agent/commands/registry.js";

const MAX_VISIBLE_COUNT = commands.length;

export function useCommandAutocomplete(input: string) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const show = input.startsWith("/");
  const query = show ? input.slice(1).split(" ")[0].toLowerCase() : "";

  const filtered = useMemo(() => {
    if (!show) return [];
    return commands.filter((c) => c.name.startsWith(query));
  }, [show, query]);

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
    maxVisibleCount: MAX_VISIBLE_COUNT,
    next,
    prev,
  };
}
