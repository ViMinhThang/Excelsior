export type Focus = "app" | "input" | "transcript" | "overlay" | "settings";

export type FocusEvent =
  | "confirm-arrived"
  | "question-arrived"
  | "session-list-opened"
  | "overlay-dismissed"
  | "blur"
  | "refocus"
  | "settings-opened"
  | "settings-closed";

export function nextFocus(current: Focus, event: FocusEvent): Focus {
  switch (event) {
    case "confirm-arrived":
    case "question-arrived":
    case "session-list-opened":
      return "overlay";
    case "overlay-dismissed":
      return current === "overlay" ? "input" : current;
    case "blur":
      return current === "input" ? "transcript" : current;
    case "refocus":
      return "input";
    case "settings-opened":
      return "settings";
    case "settings-closed":
      return "input";
    default:
      return current;
  }
}
