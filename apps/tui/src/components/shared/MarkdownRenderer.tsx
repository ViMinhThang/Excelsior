import { memo, useMemo } from "react";
import { lexer } from "marked";
import { normalizePipeTables } from "../../lib/markdown/tables.js";
import { BlockRenderer } from "./markdown/BlockRenderer.js";
import { type StyleProps } from "./markdown/styles.js";

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

