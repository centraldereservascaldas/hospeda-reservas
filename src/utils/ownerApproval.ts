export function isMissingOwnerReviewMetadataError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const details = error as { code?: unknown; message?: unknown };
  const code = typeof details.code === 'string' ? details.code : '';
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const referencesReviewMetadata = /\breviewed_(?:by|at)\b/.test(message);

  return referencesReviewMetadata && (
    code === '42703'
    || code === 'PGRST204'
    || message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('could not find')
  );
}
