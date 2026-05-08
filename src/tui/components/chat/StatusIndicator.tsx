import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

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

  if (status === 'error') {
    return <Text color="red">x</Text>;
  }

  return (
    <Text color={status === 'pending' ? 'cyan' : 'dim'} dimColor={status === 'pending' ? pulse : false}>
      {status === 'pending' ? "..." : "ok"}
    </Text>
  );
};

export default StatusIndicator;
