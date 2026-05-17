import { ContentPartType } from "@typegaro/atom-plugin";
import type { ImagePart, TextPart, UserMessagePart } from "@typegaro/atom-plugin";

export function createImagePart(mimeType: string, bytes: Buffer): ImagePart {
  return {
    type: ContentPartType.Image,
    mimeType,
    data: bytes.toString("base64")
  };
}

export function stripImageInputMarkers(value: string): string {
  return value
    .replace(/[ \t]*\[Image \d+\][ \t]*/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function buildUserInput(value: string, images: ImagePart[]): string | UserMessagePart[] {
  if (images.length === 0) {
    return value;
  }

  const parts: UserMessagePart[] = [];
  if (value) {
    const textPart: TextPart = { type: ContentPartType.Text, text: value };
    parts.push(textPart);
  }
  parts.push(...images);
  return parts;
}

export function formatSubmittedUserInput(value: string, images: ImagePart[]): string {
  if (images.length === 0) {
    return value;
  }

  const imageLabel = `[${images.length} image${images.length === 1 ? "" : "s"}]`;
  return value ? `${value}\n${imageLabel}` : imageLabel;
}
