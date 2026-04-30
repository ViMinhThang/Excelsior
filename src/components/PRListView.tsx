import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { useReview } from "../context/ReviewContext.js";

import { useNavigation } from "../context/index.js";
import { useReviewActions } from "../hooks/useReviewActions.js";

export const PRListView = () => {
  const { pullRequests } = useReview();
  const { handlePullRequestSelect } = useReviewActions();
  const { setView } = useNavigation();
  
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
              setView("MAIN");
              return;
            }

            void handlePullRequestSelect(Number(item.value));
          }}
        />
      </Box>
    </Box>
  );
};
