import { memo, type FC } from 'react';
import { Box, Text } from 'ink';
import TextInput from './SafeTextInput.js';
import { theme } from '../../theme.js';
import Panel from '../shared/Panel.js';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  shouldSubmit?: (value: string) => boolean;
}

const ChatInput: FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  focus = true,
  mask,
  shouldSubmit,
}) => {
  return (
    <Panel
      marginTop={1}
      marginBottom={0}
      backgroundColor="transparent"
      borderTopBottomColor={focus ? theme.colors.muted : theme.colors.border}
    >
      <Box paddingLeft={0} flexDirection="row">
        <Text color="white" dimColor>&gt; </Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
          focus={focus}
          mask={mask}
          shouldSubmit={shouldSubmit}
        />
      </Box>
    </Panel>
  );
};

export default memo(ChatInput);
