import { ContentPartType, MessageRole } from "@typegaro/atom-plugin";
import type { PluginSessionEvent, PluginSessionSummary } from "@typegaro/atom-plugin";

export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type SessionEvent = PluginSessionEvent;
export type SessionSummary = PluginSessionSummary;

export type StoredMessage = StoredUserMessage | StoredAssistantMessage | StoredToolMessage;

export interface StoredTextPart {
  type: ContentPartType.Text;
  text: string;
}

export interface StoredImagePart {
  type: ContentPartType.Image;
  mimeType: string;
  data: string;
}

export interface StoredThinkingPart {
  type: ContentPartType.Thinking;
  text: string;
}

export interface StoredToolCallPart {
  type: ContentPartType.ToolCall;
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StoredUserMessage {
  role: MessageRole.User;
  content: Array<StoredTextPart | StoredImagePart>;
}

export interface StoredAssistantMessage {
  role: MessageRole.Assistant;
  api: string;
  model: string;
  content: Array<StoredTextPart | StoredThinkingPart | StoredToolCallPart>;
  stopReason: string;
  usage?: UsageSnapshot;
}

export interface StoredToolMessage {
  role: MessageRole.Tool;
  toolCallId: string;
  toolName: string;
  content: StoredTextPart[];
  isError: boolean;
}
