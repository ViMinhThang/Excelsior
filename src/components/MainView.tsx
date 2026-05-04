import React from "react";
import { Box, Text } from "ink";
import { useConfig } from "../context/ConfigContext.js";
import { useReview } from "../context/ReviewContext.js";
import { useNavigation, useTask, useChat } from "../context/index.js";
import { useCommandInput } from "../hooks/useCommandInput.js";
import { CommandBar } from "./MainView/CommandBar.js";
import { AssistantResponse } from "./MainView/AssistantResponse.js";
import { Header } from "./MainView/Header.js";
import { WorkspaceInfo } from "./MainView/WorkspaceInfo.js";

import { usePromptActions } from "../hooks/usePromptActions.js";
import { useReviewActions } from "../hooks/useReviewActions.js";

export const MainView = () => {
  const { config } = useConfig();
  const { mode } = useReview();
  const { setView } = useNavigation();
  const { isLoading, loadingMessage } = useTask();
  const { chatResponse } = useChat();
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

    </Box>
  );
};
