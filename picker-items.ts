export interface PickerItem<TValue> {
  name: string;
  description?: string;
  value: TValue;
}

export function rankPickerItems<TValue>(items: PickerItem<TValue>[], query: string): PickerItem<TValue>[] {
  if (!query) {
    return items;
  }

  return items
    .map((item) => ({ item, score: getFuzzyScore(`${item.name} ${item.description ?? ""}`, query) }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .map((entry) => entry.item);
}

function getFuzzyScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  if (haystack.includes(needle)) {
    return 1000 - haystack.indexOf(needle);
  }

  let score = 0;
  let cursor = 0;
  let streak = 0;

  for (const char of needle) {
    const matchIndex = haystack.indexOf(char, cursor);
    if (matchIndex === -1) {
      return Number.NEGATIVE_INFINITY;
    }

    streak = matchIndex === cursor ? streak + 1 : 0;
    score += 10 + streak * 5 - matchIndex;
    cursor = matchIndex + 1;
  }

  return score;
}
