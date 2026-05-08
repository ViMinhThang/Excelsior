import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { theme } from '../../theme.js';

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (status === 'pending') {
      const timer = setInterval(() => {
        setPulse(prev => !prev);
      }, 600);
      return () => clearInterval(timer);
    }
    setPulse(false);
  }, [status]);

  if (status === 'completed') {
    return null;
  }

  if (status === 'error') {
    return <Text color={theme.colors.error}>{theme.glyphs.error}</Text>;
  }

  return (
    <Text color={theme.colors.activity} dimColor={pulse}>
      {theme.glyphs.pending}
    </Text>
  );
};

export default StatusIndicator;
