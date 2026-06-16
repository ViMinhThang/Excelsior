import { memo, type FC } from 'react';
import type { MouseEvent } from "@opentui/core";
import TextInput from './SafeTextInput.js';
import { theme } from '../../theme.js';
import Panel from '../shared/Panel.js';
import { textAttrs } from '../../platform/opentui/textAttributes.js';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  shouldSubmit?: (value: string) => boolean;
  onMouseDown?: (event: MouseEvent) => void;
}

const ChatInput: FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  focus = true,
  mask,
  shouldSubmit,
  onMouseDown,
}) => {
  return (
    <box width="100%" onMouseDown={onMouseDown}>
      <Panel
        marginTop={0}
        marginBottom={0}
        backgroundColor="transparent"
        borderTopBottomColor={focus ? theme.colors.muted : theme.colors.border}
        flexShrink={0}
        minHeight={3}
      >
        <box paddingLeft={0} flexDirection="row" flexGrow={1} width="100%">
          <text fg={theme.colors.text} attributes={textAttrs({ dim: true })}>&gt; </text>
          <TextInput
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            focus={focus}
            mask={mask}
            shouldSubmit={shouldSubmit}
          />
        </box>
      </Panel>
    </box>
  );
};

export default memo(ChatInput);
