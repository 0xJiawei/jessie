export type MessageRole = "system" | "user" | "assistant";

export interface ChatAppView {
  serverId: string;
  resourceUri: string;
  html: string;
  title: string;
  toolName: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  appView?: ChatAppView;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
