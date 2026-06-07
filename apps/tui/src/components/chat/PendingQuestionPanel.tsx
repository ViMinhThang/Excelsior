import type { FC } from "react";
import type { AskQuestionRequest } from "@excelsior/core";
import { theme } from "../../theme.js";
import Panel from "../shared/Panel.js";
import TextInput from "./SafeTextInput.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

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
      <box flexDirection="column">
        <text fg={theme.colors.text} attributes={textAttrs({ bold: true })}>{pending.question}</text>

        {pending.options.length > 0 && (
          <box flexDirection="column" marginTop={1} paddingLeft={theme.spacing.toolIndent}>
            {pending.options.map((option, index) => (
              <box key={option.id} flexDirection="column">
                <text fg={theme.colors.highlightAction} attributes={textAttrs({ bold: true })}>
                  {index + 1}. {option.label}
                </text>
                {option.description ? (
                  <text fg={theme.colors.secondary}>{option.description}</text>
                ) : null}
              </box>
            ))}
          </box>
        )}

        <box marginTop={1} paddingLeft={theme.spacing.toolIndent} flexDirection="row">
          <text fg={theme.colors.highlightAction} attributes={textAttrs({ bold: true })}>&gt; </text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            shouldSubmit={shouldSubmit}
            placeholder={placeholder}
            focus
          />
        </box>
      </box>
    </Panel>
  );
};

export default PendingQuestionPanel;