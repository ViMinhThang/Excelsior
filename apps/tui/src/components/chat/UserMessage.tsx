import { memo, type FC } from 'react';
import { theme } from '../../theme.js';

interface UserMessageProps {
  content: string;
  timestamp?: string;
}

const UserMessage: FC<UserMessageProps> = ({ content }) => {
  return (
    <box flexDirection="row" gap={1} paddingBottom={1}>
      <text fg={theme.colors.highlightBrand}>●</text>
      <box flexDirection="column" flexGrow={1}>
        <text fg={theme.colors.text}>{content}</text>
      </box>
    </box>
  );
};

export default memo(UserMessage);
