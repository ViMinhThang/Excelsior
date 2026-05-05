import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface StatusIndicatorProps {
  status: "pending" | "completed" | "error";
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    // Pulse only during pending state
    if (status === 'pending') {
      const timer = setInterval(() => {
        setPulse(prev => !prev);
      }, 600);
      return () => clearInterval(timer);
    } else {
      setPulse(false);
    }
  }, [status]);

  if (status === 'error') {
    return <Text color="red">●</Text>;
  }

  // White Big Dot with pulse for pending, static for completed
  return (
    <Text color="white" dimColor={status === 'pending' ? pulse : false}>
      ●
    </Text>
  );
};

export default StatusIndicator;
