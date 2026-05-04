import React from "react";
import { Box, Text } from "ink";
import { useNotification } from "../context/index.js";

export const NotificationToast = () => {
  const { notification } = useNotification();

  if (!notification) return null;

  const { message, type } = notification;

  let borderColor = "blue";
  let icon = "ℹ";
  let label = "INFO";

  if (type === "error") {
    borderColor = "red";
    icon = "✖";
    label = "ERROR";
  } else if (type === "success") {
    borderColor = "green";
    icon = "✔";
    label = "SUCCESS";
  }

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexDirection="row"
      width="100%"
      marginTop={1}
    >
      <Box marginRight={1}>
        <Text color={borderColor} bold>
          {icon} {label}
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text>{message}</Text>
        {type === "error" && (
          <Text dimColor>(Press Esc to dismiss)</Text>
        )}
      </Box>
    </Box>
  );
};
