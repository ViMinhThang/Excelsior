export type View = "MAIN" | "SETTINGS" | "PROVIDER_SELECT" | "MODEL_SELECT" | "CREDENTIAL_INPUT" | "PR_LIST";
export type CredentialField = "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "DEEPSEEK_API_KEY" | "OPENROUTER_API_KEY" | "GITHUB_TOKEN" | null;
export type NotificationType = "error" | "success" | "info";

export interface Notification {
  message: string;
  type: NotificationType;
}

export interface NavigationState {
  view: View;
}

export interface NavigationActions {
  setView(view: View): void;
}

export type NavigationFacade = NavigationState & NavigationActions;

export interface TaskState {
  isLoading: boolean;
  loadingMessage: string;
}

export interface TaskActions {
  startTask(id: string, message: string): void;
  endTask(id: string): void;
}

export type TaskFacade = TaskState & TaskActions;

export interface NotificationState {
  notification: Notification | null;
}

export interface NotificationActions {
  notify(message: string, type?: NotificationType, duration?: number): void;
  clearNotification(): void;
}

export type NotificationFacade = NotificationState & NotificationActions;

export interface CredentialState {
  credentialInput: string;
  credentialField: CredentialField;
}

export interface CredentialActions {
  setCredentialInput(value: string): void;
  setCredentialField(field: CredentialField): void;
}

export type CredentialFacade = CredentialState & CredentialActions;

export interface ChatState {
  chatResponse: string | null;
  command: string;
}

export interface ChatActions {
  setChatResponse(response: string | null): void;
  setCommand(command: string): void;
}

export type ChatFacade = ChatState & ChatActions;