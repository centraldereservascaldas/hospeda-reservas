export function getAuthCallbackError(search: string, hash: string): string {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return (
    searchParams.get('error_description') ||
    hashParams.get('error_description') ||
    searchParams.get('error') ||
    hashParams.get('error') ||
    ''
  );
}
