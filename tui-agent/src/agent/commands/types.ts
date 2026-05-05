export interface CommandContext {
  navigate: (screen: any) => void;
  goBack: () => void;
  appendMessage: (role: "user" | "assistant" | "system", content: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], context: CommandContext) => Promise<void> | void;
}
