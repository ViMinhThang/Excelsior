import React from "react";
import { Box, Text } from "ink";
import { useConfig } from "../context/ConfigContext.js";
import { useReview } from "../context/ReviewContext.js";
import { useUI } from "../context/UIContext.js";
import { useCommandInput } from "../hooks/useCommandInput.js";
import { CommandBar } from "./MainView/CommandBar.js";
import { AssistantResponse } from "./MainView/AssistantResponse.js";
import { Header } from "./MainView/Header.js";
import { WorkspaceInfo } from "./MainView/WorkspaceInfo.js";

import { usePromptActions } from "../hooks/usePromptActions.js";
import { useReviewActions } from "../hooks/useReviewActions.js";

export const MainView = () => {
  const { config } = useConfig();
  const { mode, reviewReport } = useReview();
  const { chatResponse, isLoading, loadingMessage, setView } = useUI();
  const commandInput = useCommandInput();
  
  const reviewActions = useReviewActions();
  const { handleCommandSubmit } = usePromptActions(reviewActions);

  return (
    <Box flexDirection="column">
      <Header />
      <WorkspaceInfo config={config} mode={mode} />
      <AssistantResponse
        chatResponse={chatResponse}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
      />

      <Box marginTop={1} flexDirection="column">
        <CommandBar
          {...commandInput}
          onCommandSubmit={handleCommandSubmit}
          onOpenSettings={() => setView("SETTINGS")}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Use Tab to switch between the command input and the settings shortcut.</Text>
      </Box>

      {reviewReport ? (
        <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold color="cyan">
            Latest Review
          </Text>
          {reviewReport.rendered.split("\n").map((line, index) => (
            <Text key={`${index}-${line}`}>{line}</Text>
          ))}
        </Box>
      ) : null}

    </Box>
  );
};
