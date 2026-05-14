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
      setFrameIndex((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(timer);
  }, [status]);

  const isBeat = status === "pending" && (frameIndex === 1 || frameIndex === 2);
  return (
    <Text color={theme.colors.muted} dimColor={!isBeat} bold={isBeat}>
      ●
    </Text>
  );
};

export default StatusIndicator;
