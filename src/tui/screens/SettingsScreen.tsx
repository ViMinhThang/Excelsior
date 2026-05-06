import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../context/NavigationContext.js';
import { useDatabase } from '../hooks/useDatabase.js';
import ChatInput from '../components/chat/ChatInput.js';

const SettingsScreen = () => {
  const { goBack } = useNavigation();
  const { getApiKey, saveApiKey, getGithubToken, saveGithubToken } = useDatabase();
  const [apiKey, setApiKey] = useState(() => getApiKey());
  const [githubToken, setGithubToken] = useState(() => getGithubToken());
  const [status, setStatus] = useState('');
  const [focusedField, setFocusedField] = useState<'apiKey' | 'githubToken'>('apiKey');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useInput(useCallback((_input, key) => {
    if (key.tab) {
      setFocusedField(prev => prev === 'apiKey' ? 'githubToken' : 'apiKey');
    }
  }, []));

  const handleSaveApiKey = useCallback(() => {
    saveApiKey(apiKey);
    setStatus('API Key saved successfully!');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(''), 3000);
  }, [apiKey, saveApiKey]);

  const handleSaveGithubToken = useCallback(() => {
    saveGithubToken(githubToken);
    setStatus('GitHub Token saved successfully!');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(''), 3000);
  }, [githubToken, saveGithubToken]);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>Settings</Text>
        <Text color="dim"> (Press Esc to go back)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === 'apiKey' ? 'cyanBright' : 'white'}>
          {focusedField === 'apiKey' ? '● ' : '○ '}DeepSeek API Key:
        </Text>
        <ChatInput 
          value={apiKey} 
          onChange={setApiKey} 
          onSubmit={handleSaveApiKey}
          placeholder="Enter your DeepSeek API key..."
          focus={focusedField === 'apiKey'}
        />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === 'githubToken' ? 'cyanBright' : 'white'}>
          {focusedField === 'githubToken' ? '● ' : '○ '}GitHub Token:
        </Text>
        <ChatInput 
          value={githubToken} 
          onChange={setGithubToken} 
          onSubmit={handleSaveGithubToken}
          placeholder="Enter your GitHub personal access token..."
          focus={focusedField === 'githubToken'}
        />
      </Box>

      {status && (
        <Box marginBottom={1}>
          <Text color="green">{status}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="dim">Press Tab to switch input fields.</Text>
        <Text color="dim">Press Enter to save the active setting.</Text>
      </Box>
    </Box>
  );
};

export default SettingsScreen;
