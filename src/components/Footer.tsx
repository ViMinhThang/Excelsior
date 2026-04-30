import React from "react";
import { Box, Text } from "ink";
import type { ReviewMode } from "../review/types.js";

interface Props {
  mode: ReviewMode;
}

export const Footer = ({ mode }: Props) => {
  return (
    <Box justifyContent="space-between" width="100%">
      <Box>
        <Text color={mode === "ACT" ? "green" : "yellow"} bold>
          {" "}
          [{mode}]{" "}
        </Text>
      </Box>
      <Text color="dimGray"> tab: focus | ctrl+p: mode | ctrl+s: settings | ctrl+q: quit </Text>
    </Box>
  );
};
