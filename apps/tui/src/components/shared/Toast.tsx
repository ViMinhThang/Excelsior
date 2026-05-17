import { memo, type FC } from "react";
import { Box, Text } from "ink";
import type { ToastMessage, ToastType } from "../../hooks/useToast.js";
import { theme } from "../../theme.js";

interface ToastProps {
  toasts: ToastMessage[];
}

const typeColor: Record<ToastType, string> = {
  info: theme.colors.highlightBrand,
  success: theme.colors.success,
  error: theme.colors.error,
  warning: theme.colors.highlightEmphasis,
};

const typeGlyph: Record<ToastType, string> = {
  info: "\u2139",
  success: theme.glyphs.success,
  error: theme.glyphs.error,
  warning: "\u26a0",
};

const Toast: FC<ToastProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      {toasts.map((toast) => (
        <Box key={toast.id} flexDirection="row" gap={1}>
          <Text color={typeColor[toast.type]}>{typeGlyph[toast.type]}</Text>
          <Text color={typeColor[toast.type]}>{toast.text}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default memo(Toast);
