import React from "react";
import { Box, Text } from "ink";

import { type Config } from "../config.js";
import { useAppContext } from "../context/AppContext.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import { useCommandInput } from "../hooks/useCommandInput.js";
import { CommandBar } from "./MainView/CommandBar.js";
import { Header } from "./MainView/Header.js";
import { WorkspaceInfo } from "./MainView/WorkspaceInfo.js";

export const MainView = ({
  config,
  mode,
  reviewReport,
  onCommandSubmit,
  onOpenSettings,
}: {
  config: Config;
  mode: ReviewMode;
  reviewReport: ReviewReport | null;
  onCommandSubmit: (value: string) => Promise<void>;
  onOpenSettings: () => void;
}) => {
  const { isLoading } = useAppContext();
  const commandInput = useCommandInput();

  return (
    <Box flexDirection="column">
      <Header />
      <WorkspaceInfo config={config} mode={mode} />

      <Box marginTop={1} flexDirection="column">
        {isLoading ? (
          <Text color="yellow">Preparing review...</Text>
        ) : (
          <CommandBar
            {...commandInput}
            onCommandSubmit={onCommandSubmit}
            onOpenSettings={onOpenSettings}
          />
        )}
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
