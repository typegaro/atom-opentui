import { BoxRenderable, TextRenderable, type CliRenderer, type ScrollBoxRenderable } from "@opentui/core";
import { createMarkdownMessageBox, scrollTranscriptToBottom } from "./message-box";
import { createStartupLogo } from "../logo";
import type { COLORS } from "../theme";
import type { SyntaxStyle } from "@opentui/core";

export interface SystemPromptShard {
  source: string;
  content: string;
}

export interface StartupSessionView {
  getActiveSystemPrompt?(): string | undefined;
  getActiveSystemPromptShards?(): SystemPromptShard[];
}

export interface StartupViewOptions {
  renderer: CliRenderer;
  transcript: ScrollBoxRenderable;
  colors: typeof COLORS;
  syntaxStyle: SyntaxStyle;
  addMessageBox: (title: string, body: string, borderColor: string, collapsible?: boolean, transparent?: boolean, textColor?: string, paddingY?: number, wrapMode?: "none" | "char" | "word") => void;
}

export function addStartupMessage(options: StartupViewOptions, session: StartupSessionView): void {
  addStartupBanner(options.renderer, options.transcript, options.colors);
  addSystemPromptBox(options, session);
}

function addStartupBanner(renderer: CliRenderer, transcript: ScrollBoxRenderable, colors: typeof COLORS): void {
  const logo = createStartupLogo(24, 10, 22).join("\n");
  const box = new BoxRenderable(renderer, {
    width: "100%",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 1,
    paddingBottom: 0,
    flexDirection: "column"
  });

  const text = new TextRenderable(renderer, {
    width: "100%",
    content: logo,
    fg: colors.subtle,
    wrapMode: "none"
  });

  box.add(text);
  transcript.add(box);
  scrollTranscriptToBottom(transcript);
}

function addSystemPromptBox(options: StartupViewOptions, session: StartupSessionView): void {
  const shards = typeof session.getActiveSystemPromptShards === "function"
    ? session.getActiveSystemPromptShards()
    : [];

  if (shards.length > 0) {
    shards.forEach((shard, index) => {
      const source = shard.source ? ` · ${shard.source}` : "";
      createMarkdownMessageBox(
        options.renderer,
        options.transcript,
        ` System Prompt shard #${index + 1}${source}`,
        shard.content.trim(),
        options.colors.subtle,
        undefined,
        options.colors.text,
        options.colors.subtle,
        options.syntaxStyle,
        false,
        true,
        0,
        true,
        "word"
      );
    });
    return;
  }

  const systemPrompt = typeof session.getActiveSystemPrompt === "function"
    ? session.getActiveSystemPrompt()
    : undefined;
  const body = systemPrompt?.trim() || "(system prompt is still loading)";
  const color = systemPrompt ? options.colors.accent : options.colors.muted;
  const textColor = systemPrompt ? options.colors.text : options.colors.subtle;
  options.addMessageBox("▸ System Prompt", body, color, true, true, textColor, systemPrompt ? 1 : 0, "word");
}
