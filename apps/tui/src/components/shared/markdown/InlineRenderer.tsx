import { Fragment, type FC, type ReactNode } from "react";
import type { Token, Tokens } from "marked";
import { escapeXml, highlightFilenames } from "../../../lib/markdown/highlight.js";
import { getTokenText } from "../../../lib/markdown/tables.js";
import { styleAttrs, resolveTextColor, type StyleProps } from "./styles.js";
import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";

export interface InlineContentProps extends StyleProps {
  tokens: Token[];
}

export const InlineContent: FC<InlineContentProps> = ({
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

export function InlineText(props: InlineContentProps): ReactNode {
  return (
    <text>
      <InlineContent {...props} />
    </text>
  );
}
