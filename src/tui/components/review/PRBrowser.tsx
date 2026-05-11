import React, { memo } from "react";
import { Box, Text } from "ink";
import PRList from "./PRList.js";
import DiffViewer from "./DiffViewer.js";
import { PullRequest } from "../../../types.js";
import { theme } from "../../theme.js";

interface PRBrowserProps {
  prs: PullRequest[];
  prIndex: number;
  prsLoading: boolean;
  prsError: string | null;
  viewingDiff: boolean;
  diffLoading: boolean;
  diffError: string | null;
  fetchedDiff: string | null;
}

const PRBrowser: React.FC<PRBrowserProps> = ({
  prs,
  prIndex,
  prsLoading,
  prsError,
  viewingDiff,
  diffLoading,
  diffError,
  fetchedDiff,
}) => {
  return (
    <Box flexDirection="row" flexGrow={1} marginTop={1}>
      <Box flexDirection="column" width="35%" marginRight={1}>
        <Box marginBottom={1}>
          <Text bold color={theme.colors.text}>PRs targeting current branch:</Text>
        </Box>
        {prsLoading && <Text color={theme.colors.activity}>Loading PRs…</Text>}
        {prsError && <Text color={theme.colors.error}>Error: {prsError}</Text>}
        <PRList prs={prs} selectedIndex={prIndex} />
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        width="65%"
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor={theme.colors.border}
        paddingLeft={2}
      >
        {viewingDiff ? (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text bold color={theme.colors.accent}>Active PR Diff:</Text>
            </Box>
            {diffLoading && <Text color={theme.colors.activity}>Loading diff…</Text>}
            {diffError && <Text color={theme.colors.error}>Error: {diffError}</Text>}
            {fetchedDiff && !diffLoading && (
              <Box flexDirection="column" flexGrow={1}>
                <DiffViewer diff={fetchedDiff} />
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
            <Text color={theme.colors.secondary} dimColor>
              Select a PR and press Enter to view diff
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(PRBrowser);
