import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { PullRequest } from "../core/github-client.ts";
import { useAppContext } from "../context/AppContext.tsx";

export const PRListView = ({
  onSelect,
  onBack,
}: {
  onSelect: (pr: PullRequest) => void;
  onBack: () => void;
}) => {
  const { pullRequests: prs } = useAppContext();
  const items = [
    ...prs.map((pr) => ({
      label: `[#${pr.number}] ${pr.title} (${pr.author})`,
      value: pr.number.toString(),
      pr: pr,
    })),
    { label: "--- Back ---", value: "back" },
  ];

  const handleSelect = (item: any) => {
    if (item.value === "back") {
      onBack();
    } else {
      onSelect(item.pr);
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Open Pull Requests
      </Text>
      <Box marginTop={1}>
        {prs.length === 0 ? (
          <Text color="red">No open pull requests found.</Text>
        ) : (
          <SelectInput items={items} onSelect={handleSelect} />
        )}
      </Box>
      {prs.length === 0 && (
        <Box marginTop={1}>
          <SelectInput items={[{ label: "Back", value: "back" }]} onSelect={onBack} />
        </Box>
      )}
    </Box>
  );
};
