import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../context/NavigationContext.js';
import { handleCommand } from '../../agent/commands/registry.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import { useChat } from '../hooks/useChat.js';

const ChatScreen = () => {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState('');
  const {
    messages,
    isLoading,
    hasMore,
    sendMessage,
    cancel,
    loadMore,
    clearMessages,
    appendSystemMessage,
  } = useChat();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  useInput(useCallback((_input, key) => {
    if (key.escape && isLoadingRef.current) {
      cancelRef.current();
    }
    if (key.ctrl && _input === 'u') {
      loadMoreRef.current();
    }

    // Command History Navigation
    if (key.upArrow || key.downArrow) {
      const userMessages = messages.filter(m => m.role === 'user').reverse();
      
      if (key.upArrow) {
        if (historyIndex + 1 < userMessages.length) {
          const newIndex = historyIndex + 1;
          if (historyIndex === -1) {
            setOriginalInput(input);
          }
          setHistoryIndex(newIndex);
          setInput(userMessages[newIndex].content);
        }
      } else if (key.downArrow) {
        if (historyIndex >= 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          if (newIndex === -1) {
            setInput(originalInput);
          } else {
            setInput(userMessages[newIndex].content);
          }
        }
      }
    }
  }, [messages, historyIndex, input, originalInput]));

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const commandContext = {
      navigate: navigateRef.current,
      goBack: goBackRef.current,
      appendMessage: appendSystemMessage,
      clearMessages,
    };

    const isCommand = await handleCommand(trimmed, commandContext);
    if (isCommand) {
      setInput('');
      return;
    }

    setInput('');
    setHistoryIndex(-1);
    setOriginalInput('');
    await sendMessage(trimmed);
  }, [input, sendMessage, appendSystemMessage, clearMessages]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyanBright" bold>Excelsior</Text>
        <Text color="dim"> (Press 'crtl + l' for Logs)</Text>
      </Box>

      <Box flexDirection="column">
        <ChatHistory
          messages={messages}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </Box>

      {isLoading && (
        <Box marginTop={1}>
          <Text color="gray" italic>Agent is thinking... (ESC to cancel)</Text>
        </Box>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        placeholder="Type your coding task here..."
        isLoading={isLoading}
      />
    </Box>
  );
};

export default ChatScreen;
