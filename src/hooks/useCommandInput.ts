import { useEffect, useState } from "react";
import { useInput } from "ink";

import { AVAILABLE_COMMANDS } from "../constants.js";
import { useAppContext } from "../context/AppContext.js";

export const useCommandInput = () => {
  const { command, setCommand } = useAppContext();
  const [isInputFocused, setIsInputFocused] = useState(true);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const suggestions = command.startsWith("/")
    ? AVAILABLE_COMMANDS.filter((candidate) => candidate.name.startsWith(command.toLowerCase()))
    : [];

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [command]);

  useInput((_input, key) => {
    if (!isInputFocused || suggestions.length === 0) {
      return;
    }

    if (key.downArrow) {
      setSelectedSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (key.upArrow) {
      setSelectedSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (key.return && command !== suggestions[selectedSuggestionIndex]?.name) {
      setCommand(suggestions[selectedSuggestionIndex]?.name ?? command);
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
