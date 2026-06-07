import { useState, useEffect } from 'react';
import { theme } from '../../theme.js';
import { formatElapsedSeconds } from '../../lib/timeFormat.js';
import { textAttrs } from '../../platform/opentui/textAttributes.js';

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
    <box flexDirection="column" gap={0} marginTop={1}>
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true, italic: true })}>
        Thinking {frames[frame]}
      </text>
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
        Worked for {formatElapsedSeconds(elapsed)}
      </text>
    </box>
  );
};

export default ThinkingIndicator;
