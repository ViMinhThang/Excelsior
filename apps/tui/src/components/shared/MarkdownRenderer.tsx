import { memo, useMemo, type FC } from "react";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import { escapeXml, highlightCode, highlightFilenames } from "../../lib/markdown/highlight.js";
import { normalizePipeTables, formatMarkdownTable, getRawText, getTokenText } from "../../lib/markdown/tables.js";
import { theme } from "../../theme.js";

export { highlightCode, highlightFilenames } from "../../lib/markdown/highlight.js";
export { normalizePipeTables, formatMarkdownTable, type MarkdownTableInput } from "../../lib/markdown/tables.js";
const InlineRenderer: FC<{ tokens: Token[] }> = ({ tokens }) => (
  <>
    {tokens.map((token, i) => {
      const key = `inline_${token.type}_${i}`;
      switch (token.type) {
        case "text": {
          const t = token as Tokens.Text;
          if (t.tokens && t.tokens.length > 0) return <InlineRenderer key={key} tokens={t.tokens} />;
          return <Text key={key}>{highlightFilenames(token.text)}</Text>;
        }
        case "strong":
          return <Text key={key} color={theme.colors.highlightEmphasis} bold><InlineRenderer tokens={(token as Tokens.Strong).tokens} /></Text>;
        case "em":
          return <Text key={key} italic><InlineRenderer tokens={(token as Tokens.Em).tokens} /></Text>;
        case "codespan":
          return <Text key={key} color={theme.colors.highlightInline}>{escapeXml((token as Tokens.Codespan).text)}</Text>;
        case "del":
          return <Text key={key} dimColor><InlineRenderer tokens={(token as Tokens.Del).tokens} /></Text>;
        case "link": {
          const link = token as Tokens.Link;
          return <Text key={key} color={theme.colors.highlightLink}><InlineRenderer tokens={link.tokens} /> ({link.href})</Text>;
        }
        case "image": {
          const img = token as Tokens.Image;
          return <Text key={key} color={theme.colors.muted}>[image: {img.text} ({img.href})]</Text>;
        }
        case "escape":
          return <Text key={key}>{escapeXml((token as Tokens.Escape).text)}</Text>;
        case "html":
          return <Text key={key}>{escapeXml((token as Tokens.HTML).text)}</Text>;
        default:
          return <Text key={key}>{getTokenText(token)}</Text>;
      }
    })}
  </>
);

function isTableBorderChar(char: string): boolean {
  return /^[\u2500-\u257f]$/.test(char);
}

const TableLine: FC<{ line: string; id: string }> = ({ line, id }) => {
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

  return (
    <Text wrap="truncate-end">
      {segments.map((segment, index) => (
        <Text
          key={`table_segment_${id}_${index}`}
          color={segment.isBorder ? theme.colors.border : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
};

const BlockRenderer: FC<{ token: Token; index: number }> = ({ token, index }) => {
  const key = `block_${token.type}_${index}`;
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const heading = token as Tokens.Heading;
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text color={theme.colors.highlightHeading} bold><InlineRenderer tokens={heading.tokens} /></Text></Box>;
    }
    case "paragraph":
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text><InlineRenderer tokens={(token as Tokens.Paragraph).tokens} /></Text></Box>;
    case "code": {
      const code = token as Tokens.Code;
      return (
        <Box
          key={key}
          marginTop={index > 0 ? 1 : 0}
          flexDirection="column"
        >
          <Box>{highlightCode(code.text, code.lang)}</Box>
        </Box>
      );
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return <Box key={key} marginTop={index > 0 ? 1 : 0} borderLeft paddingLeft={1} borderColor={theme.colors.border}><Text color={theme.colors.muted} dimColor><InlineRenderer tokens={bq.tokens} /></Text></Box>;
    }
    case "list": {
      const listToken = token as Tokens.List;
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => (
            <Box key={`listitem_${index}_${i}`} paddingLeft={theme.spacing.indent}>
              <Text>{listToken.ordered ? `${i + 1}.` : "-"} </Text>
              <Text><InlineRenderer tokens={item.tokens} /></Text>
            </Box>
          ))}
        </Box>
      );
    }
    case "hr":
      return <Box key={key} marginTop={index > 0 ? 1 : 0}><Text color={theme.colors.muted} dimColor>{"-".repeat(40)}</Text></Box>;
    case "table": {
      const table = token as Tokens.Table;
      const lines = formatMarkdownTable({
        headers: (table.header ?? []).map((cell) => getRawText(cell.tokens)),
        rows: (table.rows ?? []).map((row) => row.map((cell) => getRawText(cell.tokens))),
        align: table.align ?? [],
      });
      return (
        <Box key={key} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {lines.map((line, li) => (
            <TableLine key={`table_line_${index}_${li}`} id={`${index}_${li}`} line={line} />
          ))}
        </Box>
      );
    }
    case "html":
      return <Text key={key}>{escapeXml((token as Tokens.HTML).text)}</Text>;
    case "def":
      return null;
    default:
      return <Text key={key}>{getTokenText(token)}</Text>;
  }
};

function MarkdownRendererInner({ content }: { content: string }) {
  const tokens = useMemo(() => lexer(normalizePipeTables(content)), [content]);
  return <Box flexDirection="column">{tokens.map((token, i) => <BlockRenderer key={`markdown_block_${token.type}_${i}`} token={token} index={i} />)}</Box>;
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
