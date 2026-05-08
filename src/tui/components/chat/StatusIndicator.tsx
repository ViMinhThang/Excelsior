import React from 'react';
import { Text } from 'ink';
import { theme } from '../../theme.js';

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  if (status === 'completed') {
    return <Text color={theme.colors.success}>•</Text>;
  }

  if (status === 'error') {
    return <Text color={theme.colors.error}>•</Text>;
  }

  return (
    <Text color={theme.colors.border}>•</Text>
  );
};

export default StatusIndicator;
