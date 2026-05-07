import React, { memo } from "react";
import { Box, Text } from "ink";
import PRList from "./PRList.js";
import DiffViewer from "./DiffViewer.js";
import { PullRequest } from "../../../types.js";

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
      {/* Left Column: PR List */}
      <Box flexDirection="column" width="35%" marginRight={1}>
        <Box marginBottom={1}>
          <Text bold>PRs targeting current branch:</Text>
        </Box>
        {prsLoading && <Text color="yellow">Loading PRs...</Text>}
        {prsError && <Text color="red">Error: {prsError}</Text>}
        <PRList prs={prs} selectedIndex={prIndex} />
      </Box>

      {/* Right Column with Left Border: Diff or Placeholder */}
      <Box
        flexDirection="column"
        flexGrow={1}
        width="65%"
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor="gray"
        paddingLeft={2}
      >
        {viewingDiff ? (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text bold color="cyan">
                Active PR Diff:
              </Text>
            </Box>
            {diffLoading && <Text color="yellow">Loading diff...</Text>}
            {diffError && <Text color="red">Error: {diffError}</Text>}
            {fetchedDiff && !diffLoading && (
              <Box flexDirection="column" flexGrow={1}>
                <DiffViewer diff={fetchedDiff} />
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
            <Text color="gray" dimColor>
              Select a PR and press Enter to view diff
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(PRBrowser);
