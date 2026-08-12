export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function truncateVisible(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return ".".repeat(maxWidth);
  return text.slice(0, maxWidth - 3) + "...";
}

export function maskSecret(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
