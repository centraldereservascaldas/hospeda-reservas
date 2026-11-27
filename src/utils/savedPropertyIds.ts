export function readSavedPropertyIds(serialized: string | null): string[] {
  if (!serialized) return [];

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed.filter(
          (id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('prop-'),
        ),
      ),
    ];
  } catch {
    return [];
  }
}
