import { useState, useCallback, useMemo } from "react";
import type { CommandDefinition } from "@excelsior/core";

interface UseCommandPaletteOptions {
  commands: CommandDefinition[];
  setInput: (value: string) => void;
}

export function getPaletteCommandInput(
  command: CommandDefinition | undefined,
): string | null {
  return command ? `/${command.name} ` : null;
}

export function useCommandPalette({
  commands,
  setInput,
}: UseCommandPaletteOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const open = useCallback(() => {
    setIsOpen(true);
    setSearch("");
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  const filtered = useMemo(() => {
    if (!search) return commands;
    const q = search.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [commands, search]);

  const next = useCallback(() => {
    setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
  }, [filtered.length]);

  const prev = useCallback(() => {
    setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
  }, [filtered.length]);

  const insertCommand = useCallback(() => {
    const cmd = filtered[selectedIndex];
    const input = getPaletteCommandInput(cmd);
    if (!input) return;
    setInput(input);
    close();
  }, [filtered, selectedIndex, setInput, close]);

  return {
    isOpen,
    search,
    setSearch,
    selectedIndex,
    filtered,
    total: commands.length,
    open,
    close,
    toggle,
    next,
    prev,
    insertCommand,
  };
}
