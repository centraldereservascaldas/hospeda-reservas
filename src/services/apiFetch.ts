const configuredApiOrigin = import.meta.env?.VITE_API_BASE_URL?.trim() ?? '';

function getApiOrigin(value: string): string {
  if (value === '') {
    return '';
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE_URL precisa ser uma origem HTTP(S) válida.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('VITE_API_BASE_URL deve conter somente a origem HTTP(S) da API.');
  }

  return url.origin;
}

const apiOrigin = getApiOrigin(configuredApiOrigin);

export function apiFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ReturnType<typeof fetch> {
  const requestInput =
    typeof input === 'string' && input.startsWith('/') ? `${apiOrigin}${input}` : input;

  return fetch(requestInput, init);
}
