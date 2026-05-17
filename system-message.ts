export function formatSystemMessage(title: string, body?: string): string {
  const normalizedTitle = normalizeSystemText(title);
  const normalizedBody = body === undefined ? undefined : normalizeSystemText(body);
  return normalizedBody ? ` ${normalizedTitle} · ${normalizedBody}` : ` ${normalizedTitle}`;
}

function normalizeSystemText(value: string): string {
  return value.trim().replace(/[.!?]+$/u, "");
}
