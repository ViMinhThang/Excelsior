import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useNavigation } from '../context/NavigationContext.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import { useChat } from '../hooks/useChat.js';

const ChatScreen = () => {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState('');
  const { messages, isLoading, sendMessage } = useChat(navigate, goBack);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const content = input;
    setInput('');
    await sendMessage(content);
  }, [input, sendMessage]);
  
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyanBright" bold>Excelsior</Text>
        <Text color="dim"> (Press 'crtl + l' for Logs)</Text>
      </Box>

      <Box flexDirection="column">
        <ChatHistory messages={messages} />
      </Box>

      {isLoading && (
        <Box marginTop={1}>
          <Text color="gray" italic>Agent is thinking...</Text>
        </Box>
      )}

      <ChatInput 
        value={input} 
        onChange={setInput} 
        onSubmit={handleSubmit}
        placeholder="Type your coding task here..."
      />
    </Box>
  );
};

export default ChatScreen;
