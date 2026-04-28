import React from "react";
import { Box, Text } from "ink";
import type { ReviewMode } from "../review/types.js";

interface Props {
  mode: ReviewMode;
  statusMessage: string;
}

export const Footer = ({ mode, statusMessage }: Props) => {
  return (
    <Box justifyContent="space-between" width="100%">
      <Box>
        <Text color={mode === "ACT" ? "green" : "yellow"} bold>
          {" "}
          [{mode}]{" "}
        </Text>
        <Text color="gray"> {statusMessage || "Ready"} </Text>
      </Box>
      <Text color="dimGray"> tab: focus | ctrl+p: mode | ctrl+s: settings | ctrl+q: quit </Text>
    </Box>
  );
};
