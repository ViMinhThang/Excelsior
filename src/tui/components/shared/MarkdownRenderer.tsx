import React, { useMemo, memo, ReactNode } from "react";
import { Box, Text } from "ink";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import stringWidth from "string-width";

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
        return <Text key={i} color="gray"> {escapeXml((token as Tokens.Codespan).text)} </Text>;
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
          <Text bold>
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
      
      const formatCodeText = (text: string) => {
        const lines = text.split('\n');
        const outLines: string[] = [];
        let i = 0;
        while (i < lines.length) {
          if (lines[i] && lines[i].includes('|') && lines[i].trim() !== '') {
            let tableLines: string[] = [];
            let j = i;
            while (j < lines.length && lines[j] && lines[j].trim() !== '' && lines[j].includes('|')) {
              tableLines.push(lines[j]);
              j++;
            }
            if (tableLines.length >= 2 && /^[\s|:-]+$/.test(tableLines[1]) && tableLines[1].includes('-')) {
              const parsedRows = tableLines.map(line => 
                line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
              );
              
              const headerLength = parsedRows[0]?.length || 0;
              parsedRows.forEach((row, rIdx) => {
                parsedRows[rIdx] = row.slice(0, headerLength);
              });

              const colWidths: number[] = [];
              parsedRows.forEach((row, rIdx) => {
                if (rIdx === 1) return;
                row.forEach((cell, cIdx) => {
                  const w = stringWidth(cell);
                  colWidths[cIdx] = Math.max(colWidths[cIdx] || 0, w);
                });
              });
              const buildRow = (cells: string[], fillChar = ' ') => {
                  return '│ ' + colWidths.map((w, cIdx) => {
                      const cell = cells[cIdx] || '';
                      const cw = stringWidth(cell);
                      return cell + fillChar.repeat(Math.max(0, w - cw));
                  }).join(' │ ') + ' │';
              };
              const topBorder = '┌─' + colWidths.map(w => '─'.repeat(w)).join('─┬─') + '─┐';
              const sepBorder = '├─' + colWidths.map(w => '─'.repeat(w)).join('─┼─') + '─┤';
              const bottomBorder = '└─' + colWidths.map(w => '─'.repeat(w)).join('─┴─') + '─┘';
              outLines.push(topBorder);
              outLines.push(buildRow(parsedRows[0] || []));
              outLines.push(sepBorder);
              for (let r = 2; r < parsedRows.length; r++) {
                  outLines.push(buildRow(parsedRows[r] || []));
              }
              outLines.push(bottomBorder);
              i = j;
              continue;
            }
          }
          outLines.push(lines[i] || "");
          i++;
        }
        return outLines.join('\n');
      };

      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          {code.lang && (
            <Box><Text color="gray" dimColor>{code.lang}</Text></Box>
          )}
          <Box paddingX={1} paddingY={1}>
            <Text>{escapeXml(formatCodeText(code.text))}</Text>
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
      
      const getRawText = (tokens: Token[] = []): string => {
        return tokens.map(t => {
          if (t.type === 'text' || t.type === 'escape' || t.type === 'html' || t.type === 'codespan') return (t as any).text || '';
          if ('tokens' in t && Array.isArray((t as any).tokens)) return getRawText((t as any).tokens);
          return (t as any).text || '';
        }).join('');
      };

      const colWidths = (table.header ?? []).map((cell: any, ci: number) => {
        let max = getRawText(cell.tokens).length;
        (table.rows ?? []).forEach((row: any) => {
          const len = getRawText(row[ci]?.tokens).length;
          if (len > max) max = len;
        });
        return Math.max(max, 3); // Ensure a minimum width
      });

      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0} flexDirection="column">
          <Box gap={2}>
            {(table.header ?? []).map((cell: any, ci: number) => (
              <Box key={ci} width={colWidths[ci]}>
                <Text bold>{renderInline(cell.tokens)}</Text>
              </Box>
            ))}
          </Box>
          <Box>
            <Text dimColor>{"─".repeat(colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * 2)}</Text>
          </Box>
          {(table.rows ?? []).map((row: any, ri: number) => (
            <Box key={ri} gap={2}>
              {(row as any[]).map((cell: any, ci: number) => (
                <Box key={ci} width={colWidths[ci]}>
                  <Text>{renderInline(cell.tokens)}</Text>
                </Box>
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
