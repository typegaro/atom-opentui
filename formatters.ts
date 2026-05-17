import { ContentPartType } from "@typegaro/atom-plugin";
import type {
  StoredTextPart,
  StoredThinkingPart,
  StoredToolCallPart,
  StoredToolMessage,
  StoredUserMessage
} from "./types";

export function renderUserMessage(message: StoredUserMessage): string {
  const text = message.content
    .filter((part): part is StoredTextPart => part.type === ContentPartType.Text)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
  const imageCount = message.content.filter((part) => part.type === ContentPartType.Image).length;

  if (text && imageCount === 0) {
    return text;
  }

  if (text && imageCount > 0) {
    return `${text}\n[${imageCount} image${imageCount === 1 ? "" : "s"}]`;
  }

  return imageCount > 0 ? `[${imageCount} image${imageCount === 1 ? "" : "s"}]` : "";
}

export function renderToolMessage(message: StoredToolMessage): string {
  const content = message.content.map((part) => part.text).join("\n\n").trim();
  return content || "[empty tool result]";
}

export function renderAssistantThinking(parts: Array<StoredTextPart | StoredThinkingPart | StoredToolCallPart>): string {
  return parts
    .filter((part): part is StoredThinkingPart => part.type === ContentPartType.Thinking)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

export function renderAssistantText(parts: Array<StoredTextPart | StoredThinkingPart | StoredToolCallPart>): string {
  return parts
    .filter((part): part is StoredTextPart => part.type === ContentPartType.Text)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

export function extractToolCalls(parts: Array<StoredTextPart | StoredThinkingPart | StoredToolCallPart>): StoredToolCallPart[] {
  return parts.filter((part): part is StoredToolCallPart => part.type === ContentPartType.ToolCall);
}

function formatToolArgumentValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (value === undefined) return "undefined";
  return JSON.stringify(value, null, 2);
}

export function formatToolArguments(args: Record<string, unknown> | undefined): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return "";

  return entries
    .map(([key, value]) => {
      const formatted = formatToolArgumentValue(value);
      return `  ${key}: ${formatted.replace(/\n/g, "\n    ")}`;
    })
    .join("\n");
}
