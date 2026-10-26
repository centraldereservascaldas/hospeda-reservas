import type { CheckoutRequestPayload } from '../services/checkoutApi';

const storagePrefix = 'crcn.checkout.submission.';
const inMemoryKeys = new Map<string, string>();
const idempotencyKeyPattern = /^[A-Za-z0-9._~-]{16,128}$/;

type CheckoutSubmission = Omit<CheckoutRequestPayload, 'idempotencyKey'>;

function serializeSubmission(submission: CheckoutSubmission): string {
  return JSON.stringify({
    listingId: submission.listingId,
    from: submission.from,
    to: submission.to,
    guests: {
      adults: submission.guests.adults,
      children: submission.guests.children,
      infants: submission.guests.infants,
      pets: submission.guests.pets,
    },
    quoteTotal: submission.quoteTotal,
    guest: {
      fullName: submission.guest.fullName,
      email: submission.guest.email,
      phone: submission.guest.phone,
    },
    acceptedTermsVersion: submission.acceptedTermsVersion,
    acceptedTerms: submission.acceptedTerms,
  });
}

async function fingerprintSubmission(serializedSubmission: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serializedSubmission),
  );

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getFingerprint(submission: CheckoutSubmission): Promise<string> {
  return fingerprintSubmission(serializeSubmission(submission));
}

export async function getOrCreateCheckoutSubmissionKey(
  submission: CheckoutSubmission,
): Promise<string> {
  const fingerprint = await getFingerprint(submission);
  const memoryKey = inMemoryKeys.get(fingerprint);
  if (memoryKey) return memoryKey;

  const storageKey = `${storagePrefix}${fingerprint}`;
  if (typeof window !== 'undefined') {
    try {
      const storedKey = window.sessionStorage.getItem(storageKey);
      if (storedKey && idempotencyKeyPattern.test(storedKey)) {
        inMemoryKeys.set(fingerprint, storedKey);
        return storedKey;
      }
    } catch {
      // Session storage may be unavailable in privacy-restricted browser contexts.
    }
  }

  const idempotencyKey = globalThis.crypto.randomUUID();
  inMemoryKeys.set(fingerprint, idempotencyKey);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(storageKey, idempotencyKey);
    } catch {
      // Keep the key in memory so retries in this page still reuse it.
    }
  }

  return idempotencyKey;
}

export async function clearCheckoutSubmissionKey(submission: CheckoutSubmission): Promise<void> {
  const fingerprint = await getFingerprint(submission);
  inMemoryKeys.delete(fingerprint);

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(`${storagePrefix}${fingerprint}`);
    } catch {
      // The submitted key is already cleared from memory.
    }
  }
}
