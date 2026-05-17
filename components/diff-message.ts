import { BoxRenderable, DiffRenderable, TextAttributes, TextRenderable, type CliRenderer, type ScrollBoxRenderable } from "@opentui/core";
import { buildUnifiedDiff, type DiffLine } from "../diff";
import { scrollTranscriptToBottom } from "./message-box";
import type { COLORS } from "../theme";

export function addDiffMessageBox(
  renderer: CliRenderer,
  transcript: ScrollBoxRenderable,
  colors: typeof COLORS,
  path: string,
  lines: DiffLine[]
): void {
  const unifiedDiff = buildUnifiedDiff(path, lines);
  const diffHeight = Math.max(lines.length + 2, 4);

  const box = new BoxRenderable(renderer, {
    width: "100%",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 1,
    paddingBottom: 1,
    flexDirection: "column",
    backgroundColor: colors.panelAlt
  });

  const label = new TextRenderable(renderer, {
    width: "100%",
    content: path,
    fg: colors.subtle,
    attributes: TextAttributes.BOLD
  });

  const diff = new DiffRenderable(renderer, {
    width: "100%",
    height: diffHeight,
    diff: unifiedDiff,
    view: "unified",
    showLineNumbers: false,
    wrapMode: "none",
    addedBg: "#142c1a",
    removedBg: "#2c1414",
    addedSignColor: colors.success,
    removedSignColor: colors.danger
  });

  box.add(label);
  box.add(diff);
  transcript.add(box);
  scrollTranscriptToBottom(transcript);
}
