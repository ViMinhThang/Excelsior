import React, { memo } from "react";
import { Box, Text } from "ink";
import { ReviewScreenMode } from "../../../types.js";
import { theme } from "../../theme.js";

interface ReviewFooterProps {
  mode: ReviewScreenMode;
  subMode: "overview" | "detail";
}

const ReviewFooter: React.FC<ReviewFooterProps> = ({ mode, subMode }) => {
  if (mode === "browser") {
    return (
      <Box>
        <Text color={theme.colors.muted}>up/down select{theme.glyphs.separator}Enter review{theme.glyphs.separator}r refresh{theme.glyphs.separator}c chat</Text>
      </Box>
    );
  }

  if (mode === "review") {
    if (subMode === "detail") {
      return (
        <Box>
          <Text color={theme.colors.muted}>up/down switch{theme.glyphs.separator}Esc overview{theme.glyphs.separator}c chat</Text>
        </Box>
      );
    }
    return (
      <Box>
        <Text color={theme.colors.muted}>up/down select{theme.glyphs.separator}^O drill{theme.glyphs.separator}Esc back{theme.glyphs.separator}c chat</Text>
      </Box>
    );
  }

  if (mode === "results") {
    return (
      <Box>
        <Text color={theme.colors.muted}>p post comment{theme.glyphs.separator}d diff{theme.glyphs.separator}c chat</Text>
      </Box>
    );
  }

  return null;
};

export default memo(ReviewFooter);
