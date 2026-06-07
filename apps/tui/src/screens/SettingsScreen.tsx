import { useState, useCallback, useEffect, useRef, type FC } from 'react';
import { useSettings } from '../hooks/useSettings.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useKeyboardInput } from '../platform/opentui/useKeyboardInput.js';
import ChatInput from '../components/chat/ChatInput.js';
import { theme } from '../theme.js';
import { textAttrs } from '../platform/opentui/textAttributes.js';

interface SettingsScreenProps {
  onClose?: () => void;
}

const SettingsScreen: FC<SettingsScreenProps> = ({ onClose }) => {
  const { getApiKey, saveApiKey, getGithubToken, saveGithubToken } = useSettings();
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

  useKeyboardInput(useCallback((_input, key) => {
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
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>Settings</text>
      </box>

      <box flexDirection="column" marginBottom={1}>
        <text fg={focusedField === 'apiKey' ? theme.colors.highlightSelected : theme.colors.muted}>
          {focusedField === 'apiKey' ? `${theme.glyphs.active}` : " "}DeepSeek API Key
        </text>
        <ChatInput
          value={apiKey}
          onChange={setApiKey}
          onSubmit={handleSaveApiKey}
          placeholder="Enter your DeepSeek API key..."
          focus={focusedField === 'apiKey'}
          mask="*"
        />
      </box>

      <box flexDirection="column" marginBottom={1}>
        <text fg={focusedField === 'githubToken' ? theme.colors.highlightSelected : theme.colors.muted}>
          {focusedField === 'githubToken' ? `${theme.glyphs.active}` : " "}GitHub Token
        </text>
        <ChatInput
          value={githubToken}
          onChange={setGithubToken}
          onSubmit={handleSaveGithubToken}
          placeholder="Enter your GitHub personal access token..."
          focus={focusedField === 'githubToken'}
          mask="*"
        />
      </box>

      {status && (
        <box marginBottom={1}>
          <text fg={theme.colors.success}>{status}</text>
        </box>
      )}

      <box marginTop={1}>
        <text fg={theme.colors.muted}>Tab switch{theme.glyphs.separator}Enter save{theme.glyphs.separator}Esc back</text>
      </box>
    </box>
  );
};

export default SettingsScreen;