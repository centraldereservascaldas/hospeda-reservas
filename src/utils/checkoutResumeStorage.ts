const tokenStoragePrefix = 'crcn.checkout.resume.';
const inMemoryTokens = new Map<string, string>();

const isSafeReference = (reference: string): boolean => /^[A-Za-z0-9]{40}$/.test(reference);
const isSafeToken = (token: string): boolean => /^[A-Za-z0-9]{64}$/.test(token);

export function saveCheckoutResumeToken(reference: string, token: string): void {
  if (!isSafeReference(reference) || !isSafeToken(token)) return;

  inMemoryTokens.set(reference, token);
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(`${tokenStoragePrefix}${reference}`, token);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function getCheckoutResumeToken(reference: string): string | null {
  if (!isSafeReference(reference)) return null;
  if (typeof window === 'undefined') return inMemoryTokens.get(reference) ?? null;

  try {
    const token = window.sessionStorage.getItem(`${tokenStoragePrefix}${reference}`);
    if (token && isSafeToken(token)) return token;
  } catch {
    return inMemoryTokens.get(reference) ?? null;
  }

  return inMemoryTokens.get(reference) ?? null;
}
