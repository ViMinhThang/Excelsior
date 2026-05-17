import { memo, type FC } from "react";
import { Box, Text } from "ink";
import type { ShortcutEntry } from "../../lib/helpShortcuts.js";
import { theme } from "../../theme.js";

interface HelpOverlayProps {
  shortcuts: ShortcutEntry[];
}

const HelpOverlay: FC<HelpOverlayProps> = ({ shortcuts }) => {
  const grouped = new Map<string, ShortcutEntry[]>();
  for (const s of shortcuts) {
    if (!grouped.has(s.context)) grouped.set(s.context, []);
    grouped.get(s.context)!.push(s);
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.colors.highlightHeading} bold>Keyboard Shortcuts</Text>
      {Array.from(grouped.entries()).map(([context, entries]) => (
        <Box key={context} flexDirection="column" marginTop={1}>
          <Text color={theme.colors.highlightBrand} bold>{context}</Text>
          {entries.map((entry) => (
            <Box key={entry.combo} flexDirection="row" gap={2} paddingLeft={1}>
              <Box width={16}>
                <Text color={theme.colors.highlightEmphasis} bold wrap="truncate-end">
                  {entry.combo}
                </Text>
              </Box>
              <Text color={theme.colors.muted} dimColor>
                {entry.description}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.colors.muted} dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
};

export default memo(HelpOverlay);
