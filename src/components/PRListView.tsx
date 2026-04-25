import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { PullRequest } from "../core/github-client.js";

export const PRListView = ({
  pullRequests,
  onBack,
  onSelect,
}: {
  pullRequests: PullRequest[];
  onBack: () => void;
  onSelect: (pullRequestNumber: number) => Promise<void>;
}) => {
  const items = [
    ...pullRequests.map((pullRequest) => ({
      label: `[#${pullRequest.number}] ${pullRequest.title} (${pullRequest.author})`,
      value: String(pullRequest.number),
    })),
    { label: "Back", value: "back" },
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Open Pull Requests
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === "back") {
              onBack();
              return;
            }

            void onSelect(Number(item.value));
          }}
        />
      </Box>
    </Box>
  );
};
