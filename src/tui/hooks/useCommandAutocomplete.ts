import { useState, useMemo, useEffect, useCallback } from "react";
import { appFeatureRegistry } from "../../features/index.js";

export function useCommandAutocomplete(input: string) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const commands = appFeatureRegistry.getCommands();

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
    maxVisibleCount: commands.length,
    next,
    prev,
  };
}
