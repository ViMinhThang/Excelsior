import React, { memo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  isLoading,
}) => {
  return (
    <Box borderStyle="single" borderColor="cyanBright" borderLeft={false} borderRight={false} paddingX={1}>
      <Text color="cyanBright" bold>{'> '} </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
};

export default memo(ChatInput);
