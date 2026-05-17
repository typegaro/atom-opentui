import type { UsageSnapshot } from "./types";

export interface StatusState {
  cwd: string;
  model: string | undefined;
  usage: UsageSnapshot;
  pendingImages: number;
}

export function formatStatus(state: StatusState, message?: string): string {
  const model = state.model ?? "unconfigured";
  const tokens = state.usage.totalTokens > 0 ? String(state.usage.totalTokens) : "0";
  const home = process.env.HOME ?? "";
  const cwd = home && state.cwd.startsWith(home)
    ? `~${state.cwd.slice(home.length)}`
    : state.cwd;

  const images = state.pendingImages > 0 ? `  🖼 ${state.pendingImages}` : "";
  const status = `⌂ ${cwd}  ⬡ ${model}  ◆ ${tokens}${images}`;
  return message ? `${status}  — ${message}` : status;
}
