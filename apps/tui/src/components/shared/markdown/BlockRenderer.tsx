import type { FC } from "react";
import type { Token, Tokens } from "marked";
import { highlightCode, escapeXml } from "../../../lib/markdown/highlight.js";
import { formatMarkdownTable, getRawText, getTokenText } from "../../../lib/markdown/tables.js";
import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";
import { InlineText, InlineContent } from "./InlineRenderer.js";
import { TableLine } from "./TableRenderer.js";
import { type StyleProps, styleAttrs } from "./styles.js";

export interface BlockRendererProps extends StyleProps {
  token: Token;
  index: number;
}

export const BlockRenderer: FC<BlockRendererProps> = ({
  token,
  index,
  dimColor,
  italic,
  textColor,
  emphasisColor,
  alternateEmphasisColor,
}) => {
  const key = `block_${token.type}_${index}`;
  const attrs = styleAttrs(dimColor, italic);
  const inlineProps = {
    dimColor,
    italic,
    textColor,
    emphasisColor,
    alternateEmphasisColor,
  };

  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} width="100%">
          <InlineText
            tokens={heading.tokens}
            {...inlineProps}
            bold
          />
        </box>
      );
    }
    case "paragraph":
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} width="100%">
          <InlineText
            tokens={(token as Tokens.Paragraph).tokens}
            {...inlineProps}
          />
        </box>
      );
    case "code": {
      const code = token as Tokens.Code;
      return (
        <box
          key={key}
          marginTop={index > 0 ? 1 : 0}
          flexDirection="column"
          width="100%"
        >
          {highlightCode(code.text, code.lang)}
        </box>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} border={["left"]} paddingLeft={1} borderColor={theme.colors.border} width="100%">
          <InlineText
            tokens={bq.tokens}
            dimColor
            italic
            textColor={textColor}
            emphasisColor={emphasisColor}
            alternateEmphasisColor={alternateEmphasisColor}
          />
        </box>
      );
    }
    case "list": {
      const listToken = token as Tokens.List;
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column" width="100%">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => (
            <box key={`listitem_${index}_${i}`} paddingLeft={theme.spacing.indent} width="100%">
              <text>
                <span fg={textColor} attributes={attrs}>
                  {listToken.ordered ? `${i + 1}. ` : "- "}
                </span>
                <InlineContent
                  tokens={item.tokens}
                  {...inlineProps}
                />
              </text>
            </box>
          ))}
        </box>
      );
    }
    case "hr":
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} width="100%">
          <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
            {"-".repeat(40)}
          </text>
        </box>
      );
    case "table": {
      const table = token as Tokens.Table;
      const lines = formatMarkdownTable({
        headers: (table.header ?? []).map((cell) => getRawText(cell.tokens)),
        rows: (table.rows ?? []).map((row) => row.map((cell) => getRawText(cell.tokens))),
        align: table.align ?? [],
      });
      return (
        <box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column" width="100%">
          {lines.map((line, li) => (
            <TableLine
              key={`table_line_${index}_${li}`}
              id={`${index}_${li}`}
              line={line}
              dimColor={dimColor}
              italic={italic}
              textColor={textColor}
            />
          ))}
        </box>
      );
    }
    case "html":
      return (
        <text key={key} fg={textColor} attributes={attrs}>
          {escapeXml((token as Tokens.HTML).text)}
        </text>
      );
    case "def":
      return null;
    default:
      return (
        <text key={key} fg={textColor} attributes={attrs}>
          {getTokenText(token)}
        </text>
      );
  }
};
