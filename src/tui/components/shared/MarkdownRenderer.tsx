import React, { useMemo, memo, ReactNode } from "react";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";

function renderInline(tokens: Token[]): ReactNode {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "text":
        return <Text key={i}>{escapeXml(token.text)}</Text>;
      case "strong":
        return <Text key={i} bold>{renderInline((token as Tokens.Strong).tokens)}</Text>;
      case "em":
        return <Text key={i} italic>{renderInline((token as Tokens.Em).tokens)}</Text>;
      case "codespan":
        return <Text key={i} backgroundColor="#2d3748" color="#e2e8f0"> {escapeXml((token as Tokens.Codespan).text)} </Text>;
      case "del":
        return <Text key={i} dimColor>{renderInline((token as Tokens.Del).tokens)}</Text>;
      case "link": {
        const link = token as Tokens.Link;
        return <Text key={i} color="cyan">{renderInline(link.tokens)} ({link.href})</Text>;
      }
      case "br":
        return <Text key={i}></Text>;
      case "escape":
        return <Text key={i}>{escapeXml((token as Tokens.Escape).text)}</Text>;
      case "image": {
        const img = token as Tokens.Image;
        return <Text key={i} color="dim">[image: {img.text} ({img.href})]</Text>;
      }
      case "html":
        return <Text key={i}>{escapeXml((token as Tokens.HTML).text)}</Text>;
      default:
        return <Text key={i}>{(token as any).text ?? ""}</Text>;
    }
  });
}

function escapeXml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface BlockRendererProps {
  token: Token;
  index: number;
}

function BlockRenderer({ token, index }: BlockRendererProps) {
  switch (token.type) {
    case "space":
      return null;

    case "heading": {
      const heading = token as Tokens.Heading;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text bold color="cyanBright" underline={heading.depth <= 2}>
            {renderInline(heading.tokens)}
          </Text>
        </Box>
      );
    }

    case "paragraph":
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text>{renderInline((token as Tokens.Paragraph).tokens)}</Text>
        </Box>
      );

    case "code": {
      const code = token as Tokens.Code;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {code.lang && (
            <Box><Text color="gray" dimColor>{code.lang}</Text></Box>
          )}
          <Box backgroundColor="#1e1e2e" paddingX={1} paddingY={1}>
            <Text color="#cdd6f4">{escapeXml(code.text)}</Text>
          </Box>
        </Box>
      );
    }

    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} borderLeft paddingLeft={1} borderColor="gray">
          <Text dimColor>{renderInline(bq.tokens)}</Text>
        </Box>
      );
    }

    case "list": {
      const listToken = token as Tokens.List;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(listToken.items as Tokens.ListItem[]).map((item, i) => (
            <Box key={i} paddingLeft={2}>
              <Text>{listToken.ordered ? `${i + 1}.` : "•"} </Text>
              <Text>{renderInline(item.tokens)}</Text>
            </Box>
          ))}
        </Box>
      );
    }

    case "hr":
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text color="dim" dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
      );

    case "table": {
      const table = token as Tokens.Table;
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {(table.rows ?? []).map((row: any, ri: number) => (
            <Box key={ri} gap={2}>
              {(row as any[]).map((cell: any, ci: number) => (
                <Text key={ci}>{renderInline(cell.tokens)}</Text>
              ))}
            </Box>
          ))}
        </Box>
      );
    }

    case "html":
      return <Text key={index}>{escapeXml((token as Tokens.HTML).text)}</Text>;

    case "def":
      return null;

    default:
      return <Text key={index}>{(token as any).text ?? ""}</Text>;
  }
}

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRendererInner({ content }: MarkdownRendererProps) {
  const tokens = useMemo(() => lexer(content), [content]);

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <BlockRenderer key={i} token={token} index={i} />
      ))}
    </Box>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
