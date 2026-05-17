export interface DiffLine {
  text: string;
  tone: "success" | "danger" | "muted";
}

export function buildUnifiedDiff(path: string, lines: DiffLine[]): string {
  const diffLines = lines
    .filter((line) => line.text !== "...")
    .map((line) => {
      if (line.tone === "success") return `+${line.text.startsWith("+ ") ? line.text.slice(2) : line.text}`;
      if (line.tone === "danger") return `-${line.text.startsWith("- ") ? line.text.slice(2) : line.text}`;
      return ` ${line.text.startsWith("  ") ? line.text.slice(2) : line.text}`;
    });

  const beforeCount = diffLines.filter((line) => !line.startsWith("+")).length;
  const afterCount = diffLines.filter((line) => !line.startsWith("-")).length;

  return `--- a/${path}\n+++ b/${path}\n@@ -1,${beforeCount} +1,${afterCount} @@\n${diffLines.join("\n")}`;
}
