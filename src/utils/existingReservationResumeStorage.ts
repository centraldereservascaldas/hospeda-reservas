import { getCheckoutResumeToken } from './checkoutResumeStorage';

const prefix = 'crcn.existing-reservation.resume.';
const intentPrefix = 'crcn.existing-reservation.intent.';
const memoryReferences = new Map<string, string[]>();
const validCode = (code: string): boolean => /^[A-Z0-9]{5}$/.test(code);
const validReference = (reference: string): boolean => /^[A-Za-z0-9]{40}$/.test(reference);

/** References are stored separately from their independently protected resume tokens. */
export function getExistingReservationResumeReferences(code: string): string[] {
  if (!validCode(code) || typeof window === 'undefined') return [];
  let storedValues: unknown[] = [];
  try {
    const stored = window.sessionStorage.getItem(prefix + code);
    if (stored) {
      let values: unknown = stored;
      try { values = JSON.parse(stored); } catch { /* Legacy storage contains a single raw reference. */ }
      storedValues = Array.isArray(values) ? values : [values];
    }
  } catch { /* Retain references saved in memory. */ }
  return [...storedValues, ...(memoryReferences.get(code) ?? [])].filter(
    (value): value is string => typeof value === 'string' && validReference(value) && !!getCheckoutResumeToken(value),
  ).filter((value, index, all) => all.indexOf(value) === index);
}

export function getExistingReservationResumeReference(code: string): string | null {
  const references = getExistingReservationResumeReferences(code);
  return references[references.length - 1] ?? null;
}

export function saveExistingReservationResumeReference(code: string, reference: string): void {
  if (!validCode(code) || !validReference(reference) || !getCheckoutResumeToken(reference) || typeof window === 'undefined') return;
  const references = getExistingReservationResumeReferences(code);
  if (!references.includes(reference)) references.push(reference);
  try { window.sessionStorage.setItem(prefix + code, JSON.stringify(references)); memoryReferences.delete(code); } catch { memoryReferences.set(code, references); }
}

export function getExistingReservationIntent(code: string): string | null {
  if (!validCode(code) || typeof window === 'undefined') return null;
  try {
    const key = window.sessionStorage.getItem(intentPrefix + code);
    return key && /^[A-Za-z0-9._~-]{16,128}$/.test(key) ? key : null;
  } catch { return null; }
}

export function startExistingReservationIntent(code: string): string {
  if (!validCode(code) || typeof window === 'undefined') throw new Error('Não foi possível guardar esta tentativa.');
  const key = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(intentPrefix + code, key);
    if (window.sessionStorage.getItem(intentPrefix + code) !== key) throw new Error();
  } catch { throw new Error('Não foi possível guardar esta tentativa. Verifique as configurações do navegador.'); }
  return key;
}

export function clearExistingReservationIntent(code: string): void {
  try { window.sessionStorage.removeItem(intentPrefix + code); } catch { /* A stale intent can only replay its prior request. */ }
}
