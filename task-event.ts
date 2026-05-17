export interface TaskPanelUpdate {
  title: string;
  body: string;
  visible: boolean;
}

export type TaskUpdateEvent = {
  type: "task-update";
  total?: unknown;
  doneCount?: unknown;
  items?: unknown;
};

export function formatTaskPanelUpdate(event: TaskUpdateEvent): TaskPanelUpdate {
  const items = Array.isArray(event.items) ? event.items : [];
  const lines = items
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const task = item as { id?: unknown; text?: unknown; done?: unknown };
      const text = typeof task.text === "string" ? task.text : "";
      if (!text) return undefined;
      const done = Boolean(task.done);
      const id = typeof task.id === "number" ? `${task.id}. ` : "";
      return `${done ? "✓" : "○"} ${id}${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return { title: "Task", body: "", visible: false };
  }

  const doneCount = typeof event.doneCount === "number" ? event.doneCount : lines.filter((line) => line.startsWith("✓")).length;
  const total = typeof event.total === "number" ? event.total : lines.length;

  return {
    title: `Task ${doneCount}/${total}`,
    body: lines.join("\n"),
    visible: doneCount < total
  };
}
