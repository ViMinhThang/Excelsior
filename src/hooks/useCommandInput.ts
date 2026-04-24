import { useState, useEffect } from "react";
import { useInput } from "ink";
import { useAppContext } from "../context/AppContext.tsx";
import { AVAILABLE_COMMANDS } from "../constants.ts";

export const useCommandInput = (onCommandSubmit: (val: string) => void) => {
  const { command, setCommand } = useAppContext();
  const [isInputFocused, setIsInputFocused] = useState(true);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const suggestions = command.startsWith("/")
    ? AVAILABLE_COMMANDS.filter((c) =>
        c.name.startsWith(command.toLowerCase())
      )
    : [];

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [command]);

  useInput((input, key) => {
    if (key.tab) {
      setIsInputFocused((prev) => !prev);
      return;
    }

    if (suggestions.length === 0 || !isInputFocused) return;

    if (key.downArrow) {
      setSelectedSuggestionIndex((prev) => (prev + 1) % suggestions.length);
    } else if (key.upArrow) {
      setSelectedSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (key.return && command !== suggestions[selectedSuggestionIndex]?.name) {
      setCommand(suggestions[selectedSuggestionIndex]!.name);
    }
  });

  return {
    command,
    setCommand,
    isInputFocused,
    setIsInputFocused,
    suggestions,
    selectedSuggestionIndex,
  };
};
