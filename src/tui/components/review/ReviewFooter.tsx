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
        <Text color="dim">↑↓ select · Enter review · r refresh · c chat</Text>
      </Box>
    );
  }

  if (mode === "review") {
    if (subMode === "detail") {
      return (
        <Box>
          <Text color="dim">↑↓ switch · Esc overview · c chat</Text>
        </Box>
      );
    }
    return (
      <Box>
        <Text color="dim">↑↓ select · ^O drill · Esc back · c chat</Text>
      </Box>
    );
  }

  if (mode === "results") {
    return (
      <Box>
        <Text color="dim">p post comment · d diff · c chat</Text>
      </Box>
    );
  }

  return null;
};

export default memo(ReviewFooter);
