import React from "react";
import { Box, Text } from "ink";

interface Suggestion {
  name: string;
  description: string;
}

interface Props {
  suggestions: Suggestion[];
  selectedIndex: number;
}

export const CommandSuggestions = React.memo(({ suggestions, selectedIndex }: Props) => {
  if (suggestions.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginTop={-1}
    >
      {suggestions.map((s, index) => (
        <Box key={s.name} flexDirection="row" justifyContent="space-between">
          <Text color="yellow" inverse={index === selectedIndex}>
            {s.name}
          </Text>
          <Box marginLeft={2}>
            <Text dimColor inverse={index === selectedIndex}>
              {s.description}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
});
