import React from "react";
import { Box, Text } from "ink";

interface Suggestion {
  name: string;
  description: string;
}

export const CommandSuggestions = React.memo(
  ({ selectedIndex, suggestions }: { selectedIndex: number; suggestions: Suggestion[] }) => {
    if (suggestions.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={-1}>
        {suggestions.map((suggestion, index) => (
          <Box key={suggestion.name} justifyContent="space-between">
            <Text color="yellow" inverse={index === selectedIndex}>
              {suggestion.name}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor inverse={index === selectedIndex}>
                {suggestion.description}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  },
);
