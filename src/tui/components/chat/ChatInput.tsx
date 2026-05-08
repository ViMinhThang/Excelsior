import React, { memo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from '../../theme.js';
import Panel from '../shared/Panel.js';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  focus?: boolean;
  mask?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  isLoading,
  focus = true,
  mask,
}) => {
  return (
    <Panel 
      marginTop={1} 
      marginBottom={0} 
      backgroundColor="transparent"
      borderTopBottomColor={theme.colors.border}
    >
      <Box paddingLeft={1}>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
          focus={focus}
          mask={mask}
        />
      </Box>
    </Panel>
  );
};

export default memo(ChatInput);
