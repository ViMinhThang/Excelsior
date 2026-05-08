import React, { memo, ReactNode } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";

interface FeedRendererProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyFn?: (item: T, index: number) => string;
  emptyComponent?: ReactNode;
}

function FeedRendererInner<T>({ items, renderItem, keyFn, emptyComponent }: FeedRendererProps<T>) {
  if (items.length === 0 && emptyComponent) {
    return <Box>{emptyComponent}</Box>;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {items.map((item, index) => {
        const key = keyFn ? keyFn(item, index) : String(index);
        return (
          <Box key={key} marginTop={index > 0 ? 1 : 0}>
            {renderItem(item, index)}
          </Box>
        );
      })}
    </Box>
  );
}

export const FeedRenderer = memo(FeedRendererInner) as typeof FeedRendererInner;

export function TextBlock({ text }: { text: string }) {
  return <Text color={theme.colors.text}>{text}</Text>;
}
