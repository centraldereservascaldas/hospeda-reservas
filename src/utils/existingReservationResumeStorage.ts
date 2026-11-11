import { getCheckoutResumeToken } from './checkoutResumeStorage';

const prefix = 'crcn.existing-reservation.resume.';
const inMemoryReferences = new Map<string, string>();
const validCode = (code: string): boolean => /^[A-Z0-9]{5}$/.test(code);
const validReference = (reference: string): boolean => /^[A-Za-z0-9]{40}$/.test(reference);

/** Reference only: access to the order still requires the independently stored resume token. */
export function saveExistingReservationResumeReference(code: string, reference: string): void {
  if (!validCode(code) || !validReference(reference) || !getCheckoutResumeToken(reference) || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${prefix}${code}`, reference);
    inMemoryReferences.delete(code);
  } catch {
    // Preserve recovery during this page session when browser storage is blocked.
    inMemoryReferences.set(code, reference);
  }
}

export function getExistingReservationResumeReference(code: string): string | null {
  if (!validCode(code) || typeof window === 'undefined') return null;
  const key = `${prefix}${code}`;
  let storedReference: string | null = null;
  try { storedReference = window.sessionStorage.getItem(key); } catch { /* Use the in-memory reference. */ }
  const reference = inMemoryReferences.get(code) ?? storedReference;
  if (reference === null) return null;
  if (validReference(reference) && getCheckoutResumeToken(reference)) return reference;
  inMemoryReferences.delete(code);
  try { window.sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  return null;
}
