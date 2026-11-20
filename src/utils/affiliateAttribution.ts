import { apiFetch } from '../services/apiFetch';

const STORAGE_KEY = 'crcn.affiliateReferral.v2';
const PENDING_KEY = 'crcn.affiliateReferral.pending.v1';
type Capture = { reference: string; listingId: string; signature: string; issuedAt?: number };
let pendingCapture: Promise<void> = Promise.resolve();
let memoryPending: Capture | undefined;

function validCapture(value: unknown): value is Capture {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.reference === 'string' &&
    /^[A-Za-z0-9]{40}$/.test(c.reference) &&
    typeof c.listingId === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(c.listingId) &&
    typeof c.signature === 'string' &&
    /^[a-f0-9]{64}$/.test(c.signature) &&
    (c.issuedAt === undefined ||
      (typeof c.issuedAt === 'number' && Number.isSafeInteger(c.issuedAt) && c.issuedAt > 0))
  );
}
function pending(storage: Storage): Capture | undefined {
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (validCapture(value)) return value;
    }
  } catch {
    /* use memory */
  }
  return memoryPending;
}
function rememberPending(storage: Storage, capture: Capture): void {
  memoryPending = capture;
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(capture));
  } catch {
    /* retained until the page closes */
  }
}
function clearPending(storage: Storage, capture: Capture): void {
  if (JSON.stringify(memoryPending) === JSON.stringify(capture)) memoryPending = undefined;
  try {
    const current: unknown = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    if (JSON.stringify(current) === JSON.stringify(capture)) storage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
}
async function submitCapture(storage: Storage, capture: Capture): Promise<void> {
  try {
    const response = await apiFetch('/api/affiliate/capture', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referral: capture.reference,
        listingId: capture.listingId,
        signature: capture.signature,
        ...(capture.issuedAt ? { issuedAt: capture.issuedAt } : {}),
      }),
    });
    if (!response.ok) return;
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object') return;
    const data = result as Record<string, unknown>;
    if (
      data.success !== true ||
      typeof data.issuedAt !== 'number' ||
      !Number.isSafeInteger(data.issuedAt) ||
      typeof data.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.signature)
    )
      return;
    const entry = {
      reference: capture.reference,
      listingId: capture.listingId,
      issuedAt: data.issuedAt,
      signature: data.signature,
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      return;
    }
    clearPending(storage, capture);
  } catch {
    /* Keep the indication for another attempt. */
  }
}
export function captureAffiliateReferral(url: URL, storage: Storage): Promise<void> {
  const match = /^\/apartamento\/([A-Za-z0-9_-]{1,100})(?:\/[^/]*)?\/?$/.exec(url.pathname);
  const reference = url.searchParams.get('ref');
  const signature = url.searchParams.get('sig');
  const timestamp = url.searchParams.get('click');
  const capture = {
    reference,
    listingId: match?.[1],
    signature,
    ...(timestamp ? { issuedAt: Number(timestamp) } : {}),
  };
  if (!validCapture(capture)) return pendingCapture;
  rememberPending(storage, capture);
  pendingCapture = pendingCapture.then(() => submitCapture(storage, capture));
  return pendingCapture;
}
export async function retryAffiliateCapture(listingId: string, storage: Storage): Promise<boolean> {
  await pendingCapture;
  const saved = pending(storage);
  if (!saved || saved.listingId !== listingId) return true;
  await submitCapture(storage, saved);
  return !pending(storage) || pending(storage)?.listingId !== listingId;
}
export function readAffiliateReferral(
  listingId: string,
  storage: Storage,
): { reference: string; signature: string; issuedAt: number } | undefined {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!validCapture(value) || value.listingId !== listingId || !value.issuedAt) return undefined;
    return { reference: value.reference, signature: value.signature, issuedAt: value.issuedAt };
  } catch {
    return undefined;
  }
}
export function affiliateTransferUrl(
  listingId: string,
  storage: Storage,
  origin: string,
): string | undefined {
  const referral = readAffiliateReferral(listingId, storage);
  if (!referral) return undefined;
  const url = new URL(`/apartamento/${encodeURIComponent(listingId)}`, origin);
  url.search = new URLSearchParams({
    ref: referral.reference,
    sig: referral.signature,
    click: String(referral.issuedAt),
  }).toString();
  return url.toString();
}
