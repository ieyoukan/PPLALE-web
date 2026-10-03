// Storage primitives stay independent of card schemas and Zod.
export function parseBooleanFromStorage(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
}
