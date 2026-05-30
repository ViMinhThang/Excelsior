import { useState, useCallback, useEffect, useRef, type FC } from 'react';
import { Box, Text, useInput } from 'ink';
import { useDatabase } from '../hooks/useDatabase.js';
import { useNavigation } from '../context/NavigationContext.js';
import ChatInput from '../components/chat/ChatInput.js';
import { theme } from '../theme.js';

interface SettingsScreenProps {
  onClose?: () => void;
}

const SettingsScreen: FC<SettingsScreenProps> = ({ onClose }) => {
  const { getApiKey, saveApiKey, getGithubToken, saveGithubToken } = useDatabase();
  const { goBack } = useNavigation();
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
    if (key.escape) {
      if (onClose) onClose();
      else goBack();
    }
  }, [onClose, goBack]));

  const handleSaveApiKey = useCallback(() => {
    saveApiKey(apiKey);
    setStatus('ok API Key saved');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(''), 3000);
  }, [apiKey, saveApiKey]);

  const handleSaveGithubToken = useCallback(() => {
    saveGithubToken(githubToken);
    setStatus('ok GitHub Token saved');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(''), 3000);
  }, [githubToken, saveGithubToken]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={theme.colors.highlightHeading} bold>Settings</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === 'apiKey' ? theme.colors.highlightSelected : theme.colors.muted}>
          {focusedField === 'apiKey' ? `${theme.glyphs.active}` : " "}DeepSeek API Key
        </Text>
        <ChatInput
          value={apiKey}
          onChange={setApiKey}
          onSubmit={handleSaveApiKey}
          placeholder="Enter your DeepSeek API key..."
          focus={focusedField === 'apiKey'}
          mask="*"
        />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={focusedField === 'githubToken' ? theme.colors.highlightSelected : theme.colors.muted}>
          {focusedField === 'githubToken' ? `${theme.glyphs.active}` : " "}GitHub Token
        </Text>
        <ChatInput
          value={githubToken}
          onChange={setGithubToken}
          onSubmit={handleSaveGithubToken}
          placeholder="Enter your GitHub personal access token..."
          focus={focusedField === 'githubToken'}
          mask="*"
        />
      </Box>

      {status && (
        <Box marginBottom={1}>
          <Text color={theme.colors.success}>{status}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.colors.muted}>Tab switch{theme.glyphs.separator}Enter save{theme.glyphs.separator}Esc back</Text>
      </Box>
    </Box>
  );
};

export default SettingsScreen;
