import { memo, type FC } from "react";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface AppHeaderProps {
  workspaceName: string;
  branchName?: string | null;
  modelLabel: string;
}

const AppHeader: FC<AppHeaderProps> = ({ workspaceName, branchName, modelLabel }) => {
  return (
    <box
      flexDirection="row"
      width="100%"
      paddingY={0}
      border={["bottom"]}
      borderStyle="single"
      borderColor={theme.colors.border}
    >
      <box flexGrow={1} minWidth={0} flexDirection="row" gap={1}>
        <text
          fg={theme.colors.text}
          attributes={textAttrs({ bold: true })}
          truncate
        >
          {workspaceName}
        </text>
        {branchName ? (
          <text
            fg={theme.colors.highlightPriority}
            attributes={textAttrs({ bold: true })}
            truncate
          >
            {branchName}
          </text>
        ) : null}
      </box>
      <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
        {modelLabel}
      </text>
    </box>
  );
};

export default memo(AppHeader);
