import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

const ThinkingIndicator = () => {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const frames = ['.', '..', '...'];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 300);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" gap={0} paddingX={1} marginTop={1}>
      <Text color={theme.colors.muted} dimColor italic>
        Thinking {frames[frame]}
      </Text>
      <Text color={theme.colors.muted} dimColor>
        Worked for {formatDuration(elapsed)}
      </Text>
    </Box>
  );
};

export default ThinkingIndicator;
