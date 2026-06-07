import { Fragment, memo, useMemo, type FC, type ReactNode } from "react";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import { escapeXml, highlightCode, highlightFilenames } from "../../lib/markdown/highlight.js";
import { normalizePipeTables, formatMarkdownTable, getRawText, getTokenText } from "../../lib/markdown/tables.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";

interface StyleProps {
  dimColor?: boolean;
  italic?: boolean;
  bold?: boolean;
  textColor?: string;
  emphasisColor?: string;
  alternateEmphasisColor?: string;
}

function styleAttrs(dimColor?: boolean, italic?: boolean, bold?: boolean) {
  return textAttrs({ dim: dimColor, italic, bold });
}

function resolveTextColor({
  bold,
  italic,
  dimColor,
  textColor,
  emphasisColor,
  alternateEmphasisColor,
}: StyleProps): string | undefined {
  if (dimColor) return textColor;
  if (bold) {
    return emphasisColor ?? theme.colors.highlight;
  }
  if (italic) {
    return alternateEmphasisColor ?? theme.colors.highlightSecondary;
  }
  return textColor;
}

interface InlineContentProps extends StyleProps {
  tokens: Token[];
}

const InlineContent: FC<InlineContentProps> = ({
  tokens,
  dimColor,
  italic,
  bold,
  textColor,
  emphasisColor,
  alternateEmphasisColor,
}) => (
  <>
    {tokens.map((token, i) => {
      const key = `inline_${token.type}_${i}`;
      const attrs = styleAttrs(dimColor, italic, bold);
      switch (token.type) {
        case "text": {
          const t = token as Tokens.Text;
          if (t.tokens && t.tokens.length > 0) {
            return (
              <InlineContent
                key={key}
                tokens={t.tokens}
                dimColor={dimColor}
                italic={italic}
                bold={bold}
                textColor={textColor}
                emphasisColor={emphasisColor}
                alternateEmphasisColor={alternateEmphasisColor}
              />
            );
          }
          const content = highlightFilenames(token.text);
          const fg = resolveTextColor({
            bold,
            italic,
            dimColor,
            textColor,
            emphasisColor,
            alternateEmphasisColor,
          });
          if (!fg && !attrs) return <Fragment key={key}>{content}</Fragment>;
          return (
            <span key={key} fg={fg} attributes={attrs}>
              {content}
            </span>
          );
        }
        case "strong":
          return (
            <strong
              key={key}
              fg={resolveTextColor({
                bold: true,
                dimColor,
                textColor,
                emphasisColor,
                alternateEmphasisColor,
              })}
              attributes={textAttrs({ bold: true })}
            >
              <InlineContent
                tokens={(token as Tokens.Strong).tokens}
                dimColor={dimColor}
                italic={italic}
                bold
                textColor={textColor}
                emphasisColor={emphasisColor}
                alternateEmphasisColor={alternateEmphasisColor}
              />
            </strong>
          );
        case "em":
          return (
            <em
              key={key}
              fg={resolveTextColor({
                bold,
                italic: true,
                dimColor,
                textColor,
                emphasisColor,
                alternateEmphasisColor,
              })}
              attributes={textAttrs({ italic: true })}
            >
              <InlineContent
                tokens={(token as Tokens.Em).tokens}
                dimColor={dimColor}
                italic
                bold={bold}
                textColor={textColor}
                emphasisColor={emphasisColor}
                alternateEmphasisColor={alternateEmphasisColor}
              />
            </em>
          );
        case "codespan":
          return (
            <span
              key={key}
              fg={dimColor ? theme.colors.muted : theme.colors.highlightInline}
              attributes={attrs}
            >
              {escapeXml((token as Tokens.Codespan).text)}
            </span>
          );
        case "del":
          return (
            <InlineContent
              key={key}
              tokens={(token as Tokens.Del).tokens}
              dimColor
              italic={italic}
              bold={bold}
              textColor={textColor}
              emphasisColor={emphasisColor}
              alternateEmphasisColor={alternateEmphasisColor}
            />
          );
        case "link": {
          const link = token as Tokens.Link;
          return (
            <Fragment key={key}>
              <InlineContent
                tokens={link.tokens}
                dimColor={dimColor}
                italic={italic}
                bold={bold}
                textColor={textColor}
                emphasisColor={emphasisColor}
                alternateEmphasisColor={alternateEmphasisColor}
              />
              <span
                fg={dimColor ? theme.colors.muted : theme.colors.highlightLink}
                attributes={attrs}
              >
                {` (${link.href})`}
              </span>
            </Fragment>
          );
        }
        case "paragraph":
          return (
            <InlineContent
              key={key}
              tokens={(token as Tokens.Paragraph).tokens}
              dimColor={dimColor}
              italic={italic}
              bold={bold}
              textColor={textColor}
              emphasisColor={emphasisColor}
              alternateEmphasisColor={alternateEmphasisColor}
            />
          );
        case "image": {
          const img = token as Tokens.Image;
          return (
            <span key={key} fg={theme.colors.muted} attributes={attrs}>
              {`[image: ${img.text} (${img.href})]`}
            </span>
          );
        }
        case "escape":
          return (
            <span key={key} fg={textColor} attributes={attrs}>
              {escapeXml((token as Tokens.Escape).text)}
            </span>
          );
        case "html":
          return (
            <span key={key} fg={textColor} attributes={attrs}>
              {escapeXml((token as Tokens.HTML).text)}
            </span>
          );
        default:
          return (
            <span key={key} fg={textColor} attributes={attrs}>
              {getTokenText(token)}
            </span>
          );
      }
    })}
  </>
);

function InlineText(props: InlineContentProps): ReactNode {
  return (
    <text>
      <InlineContent {...props} />
    </text>
  );
}

function isTableBorderChar(char: string): boolean {
  return /^[\u2500-\u257f]$/.test(char);
}

interface TableLineProps extends StyleProps {
  line: string;
  id: string;
}

const TableLine: FC<TableLineProps> = ({ line, id, dimColor, italic, textColor }) => {
  const segments: Array<{ text: string; isBorder: boolean }> = [];

  for (const char of line) {
    const isBorder = isTableBorderChar(char);
    const last = segments.at(-1);
    if (last && last.isBorder === isBorder) {
      last.text += char;
    } else {
      segments.push({ text: char, isBorder });
    }
  }

  const attrs = styleAttrs(dimColor, italic);

  return (
    <text>
      {segments.map((segment, index) => (
        <span
          key={`table_segment_${id}_${index}`}
          fg={segment.isBorder ? theme.colors.border : textColor}
          attributes={attrs}
        >
          {segment.text}
        </span>
      ))}
    </text>
  );
};

interface BlockRendererProps extends StyleProps {
  token: Token;
  index: number;
}

const BlockRenderer: FC<BlockRendererProps> = ({
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

function MarkdownRendererInner({
  content,
  dimColor,
  italic,
  textColor,
  emphasisColor,
  alternateEmphasisColor,
}: { content: string } & StyleProps) {
  const tokens = useMemo(() => lexer(normalizePipeTables(content)), [content]);
  return (
    <box flexDirection="column" width="100%">
      {tokens.map((token, i) => (
        <BlockRenderer
          key={`markdown_block_${token.type}_${i}`}
          token={token}
          index={i}
          dimColor={dimColor}
          italic={italic}
          textColor={textColor}
          emphasisColor={emphasisColor}
          alternateEmphasisColor={alternateEmphasisColor}
        />
      ))}
    </box>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
