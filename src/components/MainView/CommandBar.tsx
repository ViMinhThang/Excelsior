import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { CommandSuggestions } from "./CommandSuggestions.tsx";

interface Props {
  command: string;
  setCommand: (val: string) => void;
  onCommandSubmit: (val: string) => void;
  isInputFocused: boolean;
  setIsInputFocused: (focused: boolean) => void;
  suggestions: any[];
  selectedSuggestionIndex: number;
  onMenuSelect: (item: any) => void;
}

export const CommandBar = ({
  command,
  setCommand,
  onCommandSubmit,
  isInputFocused,
  setIsInputFocused,
  suggestions,
  selectedSuggestionIndex,
  onMenuSelect,
}: Props) => {
  return (
    <>
      <Box
        marginTop={1}
        borderStyle="round"
        paddingX={1}
        flexDirection="row"
      >
        <Text color="red">❯ </Text>
        <Text color="white">
          <TextInput
            value={command}
            onChange={setCommand}
            onSubmit={onCommandSubmit}
            focus={isInputFocused}
          />
        </Text>
      </Box>

      <CommandSuggestions
        suggestions={suggestions}
        selectedIndex={selectedSuggestionIndex}
      />

      <Box marginTop={1}>
        <SelectInput
          items={[{ label: "[Ctrl+S] Settings", value: "settings" }]}
          onSelect={(item) => {
            setIsInputFocused(false);
            onMenuSelect(item);
          }}
          isFocused={!isInputFocused}
        />
      </Box>
    </>
  );
};
