import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../context/NavigationContext.js';
import { useDatabase } from '../hooks/useDatabase.js';
import ChatInput from '../components/chat/ChatInput.js';

const SettingsScreen = () => {
  const { goBack } = useNavigation();
  const { getApiKey, saveApiKey } = useDatabase();
  const [apiKey, setApiKey] = useState(() => getApiKey());
  const [status, setStatus] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSave = useCallback(() => {
    saveApiKey(apiKey);
    setStatus('API Key saved successfully!');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(''), 3000);
  }, [apiKey, saveApiKey]);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>Settings</Text>
        <Text color="dim"> (Press Backspace to go back)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>DeepSeek API Key:</Text>
        <ChatInput 
          value={apiKey} 
          onChange={setApiKey} 
          onSubmit={handleSave}
          placeholder="Enter your DeepSeek API key..."
        />
      </Box>

      {status && (
        <Box marginBottom={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="dim">Press Enter to save the API key.</Text>
      </Box>
    </Box>
  );
};

export default SettingsScreen;
