import { useEffect, useState, type FC } from "react";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const StatusIndicator: FC<StatusIndicatorProps> = ({ status }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(timer);
  }, [status]);

  const isBeat = status === "pending" && (frameIndex === 1 || frameIndex === 2);
  const color =
    status === "completed"
      ? theme.colors.success
      : status === "error"
        ? theme.colors.error
        : theme.colors.activity;

  return (
    <text
      fg={color}
      attributes={textAttrs({
        dim: status === "pending" && !isBeat,
        bold: status !== "pending" || isBeat,
      })}
    >
      {"●"}
    </text>
  );
};

export default StatusIndicator;