export const MAX_WRITING_GOAL = 1_000_000;
const READING_CHARACTERS_PER_MINUTE = 300;

export function countWritingCharacters(text: string): number {
  return Array.from(text.replace(/\s/gu, '')).length;
}

export function estimatedReadingMinutes(characterCount: number): number {
  return characterCount === 0 ? 0 : Math.ceil(characterCount / READING_CHARACTERS_PER_MINUTE);
}

export function parseWritingGoal(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const goal = Number(value);
  return Number.isSafeInteger(goal) && goal > 0 && goal <= MAX_WRITING_GOAL ? goal : null;
}
