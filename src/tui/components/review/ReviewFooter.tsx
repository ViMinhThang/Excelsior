import React, { memo } from "react";
import { Box, Text } from "ink";
import { ReviewScreenMode } from "../../../types.js";

interface ReviewFooterProps {
  mode: ReviewScreenMode;
  subMode: "overview" | "detail";
}

const ReviewFooter: React.FC<ReviewFooterProps> = ({ mode, subMode }) => {
  if (mode === "browser") {
    return (
      <Box>
        <Text color="dim">↑↓ select  Enter view diff  r refresh  c back to chat</Text>
      </Box>
    );
  }

  if (mode === "review") {
    if (subMode === "detail") {
      return (
        <Box>
          <Text color="dim">Ctrl+O prev  Ctrl+P next  Ctrl+M main  ESC overview  c chat</Text>
        </Box>
      );
    }
    return (
      <Box>
        <Text color="dim">Ctrl+O prev  Ctrl+P next  Enter drill  Ctrl+M main  c chat</Text>
      </Box>
    );
  }

  if (mode === "results") {
    return (
      <Box>
        <Text color="dim">p post PR comment  d view diff  c chat</Text>
      </Box>
    );
  }

  return null;
};

export default memo(ReviewFooter);
