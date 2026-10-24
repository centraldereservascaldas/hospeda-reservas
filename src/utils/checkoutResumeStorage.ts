const tokenStoragePrefix = 'crcn.checkout.resume.';
interface StoredCheckoutResumeToken {
  token: string;
  expiresAt: string;
}

const inMemoryTokens = new Map<string, StoredCheckoutResumeToken>();

const isSafeReference = (reference: string): boolean => /^[A-Za-z0-9]{40}$/.test(reference);
const isSafeToken = (token: string): boolean => /^[A-Za-z0-9]{64}$/.test(token);
const hasFutureExpiration = (expiresAt: string): boolean =>
  Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.now();
const isStoredCheckoutResumeToken = (value: unknown): value is StoredCheckoutResumeToken => {
  if (typeof value !== 'object' || value === null) return false;

  const storedToken = value as Record<string, unknown>;
  return typeof storedToken.token === 'string' && typeof storedToken.expiresAt === 'string';
};

export function saveCheckoutResumeToken(reference: string, token: string, expiresAt: string): void {
  if (!isSafeReference(reference)) return;
  if (!isSafeToken(token) || !hasFutureExpiration(expiresAt)) {
    clearCheckoutResumeToken(reference);
    return;
  }

  const storedToken = { token, expiresAt };
  inMemoryTokens.set(reference, storedToken);
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(`${tokenStoragePrefix}${reference}`, JSON.stringify(storedToken));
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function getCheckoutResumeToken(reference: string): string | null {
  if (!isSafeReference(reference)) return null;
  const inMemoryToken = inMemoryTokens.get(reference);
  if (inMemoryToken && hasFutureExpiration(inMemoryToken.expiresAt)) {
    return inMemoryToken.token;
  }
  inMemoryTokens.delete(reference);
  if (typeof window === 'undefined') return null;

  let storedValue: string | null;
  try {
    storedValue = window.sessionStorage.getItem(`${tokenStoragePrefix}${reference}`);
  } catch {
    return null;
  }
  if (storedValue === null) return null;

  // Older sessions stored only the token; the server still validates its expiry.
  if (isSafeToken(storedValue)) return storedValue;

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    clearCheckoutResumeToken(reference);
    return null;
  }

  if (
    isStoredCheckoutResumeToken(parsedValue) &&
    isSafeToken(parsedValue.token) &&
    hasFutureExpiration(parsedValue.expiresAt)
  ) {
    inMemoryTokens.set(reference, parsedValue);
    return parsedValue.token;
  }

  clearCheckoutResumeToken(reference);
  return null;
}

export function clearCheckoutResumeToken(reference: string): void {
  if (!isSafeReference(reference)) return;

  inMemoryTokens.delete(reference);
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(`${tokenStoragePrefix}${reference}`);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}
