import React from 'react';
import { Box, Text } from 'ink';
import { db } from '../../db/index.js';
import { useNavigation } from '../context/NavigationContext.js';

const LogsScreen = () => {
  const { navigate, goBack } = useNavigation();
  const logs = db.prepare('SELECT * FROM observation ORDER BY timestamp DESC LIMIT 10').all() as any[];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>Observation Logs</Text>
        <Text color="dim"> (Press 'c' for Chat)</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {logs.map((log) => (
          <Box key={log.id} marginBottom={1} flexDirection="column">
            <Text color="dim">[{log.timestamp}] {log.role.toUpperCase()}:</Text>
            <Text>{log.content.substring(0, 100)}{log.content.length > 100 ? '...' : ''}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="dim">Press Backspace to go back</Text>
      </Box>
    </Box>
  );
};

export default LogsScreen;
