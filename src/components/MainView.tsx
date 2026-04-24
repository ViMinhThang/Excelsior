import React from "react";
import { Box, Text } from "ink";
import { LoadingBox } from "./LoadingBox.tsx";
import { Header } from "./MainView/Header.tsx";
import { WorkspaceInfo } from "./MainView/WorkspaceInfo.tsx";
import { CommandBar } from "./MainView/CommandBar.tsx";

import { useAppContext } from "../context/AppContext.tsx";
import { useCommandInput } from "../hooks/useCommandInput.ts";

export const MainView = ({
  onSelect,
  onCommandSubmit,
}: {
  onSelect: (item: any) => void;
  onCommandSubmit: (val: string) => void;
}) => {
  const { isLoading } = useAppContext();
  const commandInput = useCommandInput(onCommandSubmit);

  return (
    <Box flexDirection="column">
      <Header />
      <WorkspaceInfo />

      {isLoading ? (
        <Box marginTop={1}>
          <LoadingBox />
        </Box>
      ) : (
        <CommandBar
          {...commandInput}
          onCommandSubmit={onCommandSubmit}
          onMenuSelect={onSelect}
        />
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Use <Text color="yellow">Tab</Text> to switch between input and menu
        </Text>
      </Box>
    </Box>
  );
};
