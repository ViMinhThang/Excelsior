import type { FC } from 'react';
import { theme } from '../theme.js';
import { textAttrs } from '../platform/opentui/textAttributes.js';

interface ErrorScreenProps {
  error: Error;
}

const ErrorScreen: FC<ErrorScreenProps> = ({ error }) => {
  return (
    <box flexDirection="column" padding={1} border borderStyle="single" borderColor={theme.colors.error}>
      <box marginBottom={1}>
        <text fg={theme.colors.error} attributes={textAttrs({ bold: true })}>Critical App Error</text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text attributes={textAttrs({ bold: true })} fg={theme.colors.highlightEmphasis}>Message:</text>
        <text fg={theme.colors.error}>{error.message}</text>
      </box>

      {error.stack && (
        <box marginBottom={1} flexDirection="column">
          <text attributes={textAttrs({ bold: true })} fg={theme.colors.highlightEmphasis}>Stack Trace:</text>
          <text fg={theme.colors.secondary} attributes={textAttrs({ dim: true })}>{error.stack.split('\n').slice(0, 5).join('\n')}</text>
        </box>
      )}

      <box marginTop={1} flexDirection="column">
        <text fg={theme.colors.muted}>Fatal error. Press ^C to exit.</text>
      </box>
    </box>
  );
};

export default ErrorScreen;