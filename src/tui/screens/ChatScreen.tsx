import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation } from '../context/NavigationContext.js';
import { handleCommand } from '../../agent/commands/registry.js';
import { subAgentBus } from '../../agent/review/spawnSubAgent.js';
import ChatHistory from '../components/chat/ChatHistory.js';
import ChatInput from '../components/chat/ChatInput.js';
import SubAgentDetail from '../components/review/SubAgentDetail.js';
import { useChat } from '../hooks/useChat.js';
import { useEvent } from '../hooks/useEvent.js';
import { useToolConfirmation } from '../hooks/useToolConfirmation.js';
import { useCommandAutocomplete } from '../hooks/useCommandAutocomplete.js';
import { CommandSuggestions } from '../components/chat/CommandSuggestions.js';
import ThinkingIndicator from '../components/chat/ThinkingIndicator.js';
import { SubAgentState } from '../../types.js';

const ChatScreen = () => {
  const { navigate, goBack } = useNavigation();
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState('');
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [subAgentIndex, setSubAgentIndex] = useState(0);
  const [chatMode, setChatMode] = useState<"input" | "subagent-detail">("input");

  const inputRef = useRef(input);
  inputRef.current = input;

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

  const onCancel = useEvent(cancel);
  const onLoadMore = useEvent(loadMore);
  const onNavigate = useEvent(navigate);
  const onGoBack = useEvent(goBack);
  const onSendMessage = useEvent(sendMessage);
  const onAppendSystemMessage = useEvent(appendSystemMessage);
  const onClearMessages = useEvent(clearMessages);

  const { pending, approve, deny } = useToolConfirmation();
  const suggestion = useCommandAutocomplete(input);

  useEffect(() => {
    if (pending) setChatMode("input");
  }, [pending]);

  useEffect(() => subAgentBus.subscribe({
    onSpawned: ({ toolCallId, role }) => {
      const newAgent: SubAgentState = {
        toolCallId,
        role,
        status: "running",
        latestLine: "",
        fullOutput: "",
        outputParts: [],
        toolCalls: [],
      };
      setSubAgents((prev) => [...prev, newAgent]);
    },
    onOutput: ({ toolCallId, latestLine, fullOutput, outputParts, toolCalls }) => {
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId
            ? { ...a, latestLine, fullOutput, outputParts: outputParts || a.outputParts, toolCalls: toolCalls || a.toolCalls }
            : a,
        ),
      );
    },
    onDone: ({ toolCallId, fullOutput }) => {
      setSubAgents((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId ? { ...a, status: "done" as const, fullOutput } : a,
        ),
      );
    },
  }), []);

  const handleInput = useEvent((_input: string, key: any) => {
    if (pending) {
      if (_input === 'y' || _input === 'Y') { approve(); return; }
      if (_input === 'n' || _input === 'N' || key.escape) {
        deny();
        if (key.escape) onCancel();
        return;
      }
      return;
    }

    if (chatMode === "subagent-detail") {
      if (key.upArrow && subAgents.length > 0) {
        setSubAgentIndex((prev) => (prev > 0 ? prev - 1 : subAgents.length - 1));
        return;
      }
      if (key.downArrow && subAgents.length > 0) {
        setSubAgentIndex((prev) => (prev < subAgents.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.escape) {
        setChatMode("input");
        return;
      }
      if (key.ctrl && _input === 'o' && subAgents.length > 0) {
        setChatMode("input");
        return;
      }
      return;
    }

    if (suggestion.show && suggestion.filtered.length > 0) {
      if (key.upArrow) { suggestion.prev(); return; }
      if (key.downArrow) { suggestion.next(); return; }
      if (key.return) {
        const cmd = suggestion.filtered[suggestion.selectedIndex];
        if (cmd) {
          const cmdText = `/${cmd.name}`;
          setInput(cmdText);
          inputRef.current = cmdText;
        }
        return;
      }
    }

    if (key.escape && isLoading) {
      onCancel();
    }
    if (key.ctrl && _input === 'u') {
      onLoadMore();
    }
    if (key.ctrl && _input === 'o' && subAgents.length > 0) {
      setSubAgentIndex(0);
      setChatMode("subagent-detail");
      return;
    }

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
  });

  useInput(handleInput);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    const commandContext = {
      navigate: onNavigate,
      goBack: onGoBack,
      appendMessage: onAppendSystemMessage,
      clearMessages: onClearMessages,
    };

    const isCommand = await handleCommand(trimmed, commandContext);
    if (isCommand) {
      setInput('');
      return;
    }

    setInput('');
    setHistoryIndex(-1);
    setOriginalInput('');
    await onSendMessage(trimmed);
  }, [onNavigate, onGoBack, onSendMessage, onAppendSystemMessage, onClearMessages]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyanBright">  ███████╗██╗  ██╗ ██████╗███████╗██╗     ███████╗██╗ ██████╗ ██████╗</Text>
        <Text color="cyanBright">  ██╔════╝╚██╗██╔╝██╔════╝██╔════╝██║     ██╔════╝██║██╔═══██╗██╔══██╗</Text>
        <Text color="cyanBright">  █████╗   ╚███╔╝ ██║     █████╗  ██║     ███████╗██║██║   ██║██████╔╝</Text>
        <Text color="cyanBright">  ██╔══╝   ██╔██╗ ██║     ██╔══╝  ██║     ╚════██║██║██║   ██║██╔══██╗</Text>
        <Text color="cyanBright">  ███████╗██╔╝ ██╗╚██████╗███████╗███████╗███████║██║╚██████╔╝██║  ██║</Text>
        <Text color="cyanBright">  ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝</Text>
      </Box>

      {chatMode === "subagent-detail" && subAgents.length > 0 ? (
        <SubAgentDetail agent={subAgents[subAgentIndex]} />
      ) : (
        <>
          <Box flexDirection="column">
            <ChatHistory
              messages={messages}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          </Box>

          {isLoading && (
            <Box marginTop={1}>
              <ThinkingIndicator />
              <Text color="gray" italic> Agent is thinking... (ESC to cancel)</Text>
            </Box>
          )}

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type your coding task here..."
            isLoading={isLoading}
            focus={!pending}
          />
        </>
      )}

          {pending && (
            <Box marginTop={1} borderStyle="single" borderColor="yellowBright" paddingX={1} paddingY={1}>
              <Text color="yellowBright" bold>⚠ Allow <Text color="white">{pending.toolName}</Text>?</Text>
              <Text color="dim"> {pending.args}</Text>
              <Text color="yellowBright"> [y/N]</Text>
            </Box>
          )}

          {suggestion.show && suggestion.filtered.length > 0 && (
            <CommandSuggestions
              commands={suggestion.filtered}
              selectedIndex={suggestion.selectedIndex}
              maxVisibleCount={suggestion.maxVisibleCount}
            />
          )}
    </Box>
  );
};

export default ChatScreen;
