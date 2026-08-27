import { useMemo } from "react";
import { useSlice, useStore } from "../store/store.js";
import { selectCatalog, selectFocus, selectInput } from "../store/selectors.js";
import { useThemeTokens } from "./useThemeTokens.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { suggestCommand } from "../actions/submit.js";

export function InputBar() {
  const store = useStore();
  const input = useSlice(selectInput);
  const focus = useSlice(selectFocus);
  const commands = useSlice(selectCatalog).commands;
  const tokens = useThemeTokens();
  const focused = focus === "input";

  const suggestion = useMemo(() => suggestCommand(input.value, commands), [input.value, commands]);
  const matchedCmd = useMemo(() => {
    if (!suggestion) return null;
    return commands.find((c) => c.name.toLowerCase() === suggestion.toLowerCase()) ?? null;
  }, [suggestion, commands]);

  return (
    <box
      flexDirection="column"
      width="100%"
      border={["top"]}
      borderStyle="single"
      borderColor={focused ? tokens.highlightSecondary : tokens.border}
      paddingX={1}
      paddingY={0}
      onMouseDown={() => {
        if (!focused) {
          store.dispatch((s) => ({ ui: { ...s.ui, focus: "input" } }));
        }
      }}
    >
      {input.value.length === 0 && focused ? (
        <box flexDirection="row" width="100%">
          <text fg={tokens.highlightBrand} attributes={textAttrs({ bold: true })}>
            {"❯ "}
          </text>
          <text fg={tokens.highlight} attributes={textAttrs({ inverse: true })}>
            {" "}
          </text>
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            {" Ask a question or type / for commands…"}
          </text>
        </box>
      ) : input.value.length === 0 && !focused ? (
        <box flexDirection="row" width="100%">
          <text fg={tokens.muted}>
            {"· "}
          </text>
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            {"(press enter to type)"}
          </text>
        </box>
      ) : (
        <box flexDirection="row" width="100%">
          <text fg={focused ? tokens.highlightBrand : tokens.muted} attributes={textAttrs({ bold: true })}>
            {focused ? "❯ " : "· "}
          </text>
          <text fg={input.value.startsWith("/") ? tokens.highlightAction : tokens.text} wrapMode="none" truncate>
            {input.value.slice(0, input.cursor)}
          </text>
          {focused ? (
            <text fg={tokens.highlight} attributes={textAttrs({ inverse: true })}>
              {input.value[input.cursor] ?? " "}
            </text>
          ) : null}
          <text fg={input.value.startsWith("/") ? tokens.highlightAction : tokens.text} wrapMode="none" truncate>
            {input.value.slice(input.cursor + 1)}
          </text>
          {!focused ? (
            <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
              {"  (press enter to edit)"}
            </text>
          ) : null}
        </box>
      )}
      {suggestion ? (
        <text fg={tokens.highlightSecondary} attributes={textAttrs({ dim: true })}>
          <span fg={tokens.highlight} attributes={textAttrs({ bold: true })}>
            {`⇥ ${suggestion}`}
          </span>
          {matchedCmd?.description ? `  — ${matchedCmd.description}` : ""}
        </text>
      ) : null}
    </box>
  );
}
