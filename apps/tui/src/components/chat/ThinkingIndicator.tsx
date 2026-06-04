import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';
import { formatElapsedSeconds } from '../../lib/timeFormat.js';

const ThinkingIndicator = () => {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const frames = ['.', '..', '...'];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 300);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <Box flexDirection="column" gap={0} paddingX={1} marginTop={1}>
      <Text color={theme.colors.muted} dimColor italic>
        Thinking {frames[frame]}
      </Text>
      <Text color={theme.colors.muted} dimColor>
        Worked for {formatElapsedSeconds(elapsed)}
      </Text>
    </Box>
  );
};

export default ThinkingIndicator;
