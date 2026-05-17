export interface ParsedCommand {
  name: string;
  arg: string;
}

export const COMMAND_HELP_TEXT = [
  "/new",
  "/undo",
  "/models",
  "/model <id>",
  "/sessions",
  "/session <id>",
  "/clear"
].join("\n");

const COMMAND_COMPLETIONS = [
  "/help",
  "/clear",
  "/new",
  "/undo",
  "/models",
  "/model ",
  "/sessions",
  "/session "
];

export function parseCommand(value: string): ParsedCommand | undefined {
  if (!value.startsWith("/")) {
    return undefined;
  }

  const [name, ...rest] = value.slice(1).trim().split(/\s+/).filter(Boolean);
  return { name: name ?? "", arg: rest.join(" ") };
}

export function getCommandSuggestion(value: string): string | undefined {
  if (!value.startsWith("/")) {
    return undefined;
  }

  return COMMAND_COMPLETIONS.find((cmd) => cmd.startsWith(value) && cmd !== value);
}
