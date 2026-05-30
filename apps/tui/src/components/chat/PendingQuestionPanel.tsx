import type { FC } from "react";
import { Box, Text } from "ink";
import type { AskQuestionRequest } from "@excelsior/core";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";
import TextInput from "./SafeTextInput.js";

export interface PendingQuestionPanelProps {
  pending: AskQuestionRequest;
  input: string;
  setInput: (value: string) => void;
  submit: () => void;
  shouldSubmit: (value: string) => boolean;
}

const PendingQuestionPanel: FC<PendingQuestionPanelProps> = ({
  pending,
  input,
  setInput,
  submit,
  shouldSubmit,
}) => {
  const placeholder = pending.allowManual
    ? "Type option number or custom answer..."
    : "Type option number...";

  return (
    <Panel
      title="Question"
      backgroundColor="transparent"
      titleColor={theme.colors.highlightAction}
      marginTop={1}
    >
      <Box flexDirection="column">
        <Text color={theme.colors.text} bold>{pending.question}</Text>

        {pending.options.length > 0 && (
          <Box flexDirection="column" marginTop={1} paddingLeft={theme.spacing.toolIndent}>
            {pending.options.map((option, index) => (
              <Box key={option.id} flexDirection="column">
                <Text color={theme.colors.highlightAction} bold>
                  {index + 1}. {option.label}
                </Text>
                {option.description ? (
                  <Text color={theme.colors.secondary}>{option.description}</Text>
                ) : null}
              </Box>
            ))}
          </Box>
        )}

        <Box marginTop={1} paddingLeft={theme.spacing.toolIndent} flexDirection="row">
          <Text color={theme.colors.highlightAction} bold>&gt; </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            shouldSubmit={shouldSubmit}
            placeholder={placeholder}
            focus
          />
        </Box>
      </Box>
    </Panel>
  );
};

export default PendingQuestionPanel;
