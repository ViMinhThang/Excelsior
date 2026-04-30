import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface Props {
  chatResponse: string | null;
  isLoading: boolean;
  loadingMessage: string;
}

export const AssistantResponse = ({ chatResponse, isLoading, loadingMessage }: Props) => {
  if (!chatResponse && !isLoading) {
    return null;
  }

  return (
    <Box marginTop={1} flexDirection="column">
      {chatResponse && (
        <Box borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold color="magenta">Assistant</Text>
          {chatResponse.split("\n").map((line, index) => (
            <Text key={`${index}-${line}`}>{line}</Text>
          ))}
        </Box>
      )}
      
      {isLoading && (
        <Box marginTop={chatResponse ? 1 : 0} paddingX={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text italic color="yellow"> {loadingMessage || "Thinking..."} </Text>
        </Box>
      )}
    </Box>
  );
};
