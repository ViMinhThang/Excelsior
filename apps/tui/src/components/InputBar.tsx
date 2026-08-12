import { useMemo } from "react";
import { useSlice } from "../store/store.js";
import { selectCatalog, selectFocus, selectInput } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { suggestCommand } from "../actions/submit.js";

export function InputBar() {
  const input = useSlice(selectInput);
  const focus = useSlice(selectFocus);
  const commands = useSlice(selectCatalog).commands;
  const tokens = useThemeTokens();
  const focused = focus === "input";

  const suggestion = useMemo(() => suggestCommand(input.value, commands), [input.value, commands]);

  return (
    <box flexDirection="column" width="100%" border={["top"]} borderStyle="single" borderColor={tokens.border} backgroundColor={tokens.inputPanel} paddingX={1} paddingY={0}>
      <box flexDirection="row" width="100%">
        <text fg={focused ? tokens.highlight : tokens.muted} attributes={textAttrs({ bold: true })}>
          {focused ? "❯ " : "· "}
        </text>
        <text fg={input.value.startsWith("/") ? tokens.highlightAction : tokens.text} wrapMode="none" truncate>
          {input.value.slice(0, input.cursor)}
        </text>
        {focused ? (
          <text fg={tokens.muted} attributes={textAttrs({ inverse: true })}>
            {input.value[input.cursor] ?? " "}
          </text>
        ) : (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            {"  (blurred — press enter to return)"}
          </text>
        )}
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          {input.value.slice(input.cursor + 1)}
        </text>
      </box>
      {suggestion ? (
        <text fg={tokens.highlightSecondary} attributes={textAttrs({ dim: true })}>
          {`⇥ ${suggestion}`}
        </text>
      ) : null}
    </box>
  );
}
