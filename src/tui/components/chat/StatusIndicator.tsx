import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../../theme.js";

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % theme.glyphs.spinner.length);
    }, 80);
    return () => clearInterval(timer);
  }, [status]);

  if (status === "completed") {
    return <Text color={theme.colors.success}>{theme.glyphs.success}</Text>;
  }

  if (status === "error") {
    return <Text color={theme.colors.error}>{theme.glyphs.error}</Text>;
  }

  return <Text color={theme.colors.accent}>{theme.glyphs.spinner[frameIndex]}</Text>;
};

export default StatusIndicator;
