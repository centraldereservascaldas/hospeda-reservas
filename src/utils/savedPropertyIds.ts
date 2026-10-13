const DEFAULT_SAVED_PROPERTY_IDS = ['JQ08G', 'stays-lacqua-204'];

export function readSavedPropertyIds(serialized: string | null): string[] {
  if (!serialized) return DEFAULT_SAVED_PROPERTY_IDS;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return DEFAULT_SAVED_PROPERTY_IDS;

    const cleaned = parsed.filter(
      (id): id is string => typeof id === 'string' && !id.startsWith('prop-'),
    );
    return cleaned.length > 0 ? cleaned : DEFAULT_SAVED_PROPERTY_IDS;
  } catch {
    return DEFAULT_SAVED_PROPERTY_IDS;
  }
}
