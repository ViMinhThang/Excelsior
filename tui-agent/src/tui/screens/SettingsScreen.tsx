import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { getSetting, setSetting } from '../../db/index.js';
import { useNavigation } from '../context/NavigationContext.js';
import ChatInput from '../components/chat/ChatInput.js';

const SettingsScreen = () => {
  const { goBack } = useNavigation();
  const [apiKey, setApiKey] = useState(() => getSetting('DEEPSEEK_API_KEY') || '');
  const [status, setStatus] = useState('');

  const handleSave = useCallback(() => {
    setSetting('DEEPSEEK_API_KEY', apiKey);
    setStatus('API Key saved successfully!');
    setTimeout(() => setStatus(''), 3000);
  }, [apiKey]);

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
