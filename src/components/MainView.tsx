import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";

export const MainView = ({
  onSelect,
  commandValue,
  onCommandChange,
  onCommandSubmit,
  workspace,
}: {
  onSelect: (item: any) => void;
  commandValue: string;
  onCommandChange: (val: string) => void;
  onCommandSubmit: (val: string) => void;
  workspace: string;
}) => {
  const [isInputFocused, setIsInputFocused] = useState(true);

  useInput((input, key) => {
    if (key.tab) {
      setIsInputFocused((prev) => !prev);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="red">
          {`
 ███████╗██╗  ██╗ ██████╗███████╗██╗     ███████╗██╗ ██████╗ ██████╗ 
 ██╔════╝╚██╗██╔╝██╔════╝██╔════╝██║     ██╔════╝██║██╔═══██╗██╔══██╗
 █████╗   ╚███╔╝ ██║     █████╗  ██║     ███████╗██║██║   ██║██████╔╝
 ██╔══╝   ██╔██╗ ██║     ██╔══╝  ██║     ╚════██║██║██║   ██║██╔══██╗
 ███████╗██╔╝ ██╗╚██████╗███████╗███████╗███████║██║╚██████╔╝██║  ██║
 ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝
          `}
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Target: </Text>
          <Text color="cyan">{workspace}</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" paddingX={1} flexDirection="row">
        <Text color="red">❯ </Text>
        <Text color="red">
          <TextInput
            value={commandValue}
            onChange={onCommandChange}
            onSubmit={onCommandSubmit}
            focus={isInputFocused}
          />
        </Text>
      </Box>

      <Box marginTop={1}>
        <SelectInput
          items={[{ label: "[Ctrl+S] Settings", value: "settings" }]}
          onSelect={(item) => {
            setIsInputFocused(false);
            onSelect(item);
          }}
          isFocused={!isInputFocused}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          (Type command or press Ctrl+S, use Tab to switch focus)
        </Text>
      </Box>
    </Box>
  );
};
