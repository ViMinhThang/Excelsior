import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";

import { CommandSuggestions } from "./CommandSuggestions.js";

interface Props {
  command: string;
  setCommand: (value: string) => void;
  onCommandSubmit: (value: string) => Promise<void>;
  isInputFocused: boolean;
  setIsInputFocused: (focused: boolean) => void;
  suggestions: Array<{ name: string; description: string }>;
  selectedSuggestionIndex: number;
  onOpenSettings: () => void;
}

export const CommandBar = ({
  command,
  setCommand,
  onCommandSubmit,
  isInputFocused,
  setIsInputFocused,
  suggestions,
  selectedSuggestionIndex,
  onOpenSettings,
}: Props) => {
  return (
    <>
      <Box borderStyle="round" paddingX={1}>
        <Text color="red">{"> "}</Text>
        <TextInput
          value={command}
          onChange={setCommand}
          onSubmit={(value) => {
            const finalValue = suggestions[selectedSuggestionIndex]?.name ?? value;
            void onCommandSubmit(finalValue);
          }}
          focus={isInputFocused}
        />
      </Box>

      <CommandSuggestions suggestions={suggestions} selectedIndex={selectedSuggestionIndex} />

      <Box marginTop={1}>
        <SelectInput
          items={[{ label: "[Ctrl+S] Settings", value: "settings" }]}
          onSelect={() => {
            setIsInputFocused(false);
            onOpenSettings();
          }}
          isFocused={!isInputFocused}
        />
      </Box>
    </>
  );
};
