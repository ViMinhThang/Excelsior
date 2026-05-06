import React, { memo } from "react";
import { Box, Text } from "ink";
import { PullRequest } from "../../../types.js";

interface PRListProps {
  prs: PullRequest[];
  selectedIndex: number;
}

function formatTimeAgo(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PRList: React.FC<PRListProps> = ({ prs, selectedIndex }) => {
  if (prs.length === 0) {
    return (
      <Box>
        <Text color="dim">No PRs found targeting this branch.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {prs.map((pr, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={pr.number}>
            <Text color={isSelected ? "cyan" : "dim"}>
              {isSelected ? " ▶ " : "   "}
            </Text>
            <Text color={isSelected ? "white" : "dim"}>
              #{pr.number}
            </Text>
            <Text color={isSelected ? "white" : "dim"} wrap="truncate">
              {" "}{pr.title}{" "}
            </Text>
            <Text color="gray" dimColor>
              @{pr.author} {formatTimeAgo(pr.createdAt)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default memo(PRList);
