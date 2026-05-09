import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { theme } from '../../theme.js';

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, [status]);

  if (status === 'completed') {
    return <Text color={theme.colors.success}>●</Text>;
  }

  if (status === 'error') {
    return <Text color={theme.colors.error}>■</Text>;
  }

  return (
    <Text color={theme.colors.accent}>{SPINNER_FRAMES[frameIndex]}</Text>
  );
};

export default StatusIndicator;
