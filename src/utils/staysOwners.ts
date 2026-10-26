export interface StaysOwnerSummary {
  id: string;
  name: string;
  propertyCount: number;
}

export interface StaysOwnerDateRange {
  from: string;
  to: string;
}

export type StaysFinanceOwnerResolution =
  | { status: 'found'; owner: Record<string, unknown> }
  | { status: 'not-found' }
  | { status: 'invalid-response' };

export function getStaysOwnerDateRanges(today = new Date()): StaysOwnerDateRange[] {
  const lastDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const firstDate = new Date(Date.UTC(lastDate.getUTCFullYear() - 10, 0, 1));
  const ranges: StaysOwnerDateRange[] = [];

  while (firstDate <= lastDate) {
    const rangeEnd = new Date(firstDate);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 364);
    if (rangeEnd > lastDate) rangeEnd.setTime(lastDate.getTime());

    ranges.push({
      from: firstDate.toISOString().slice(0, 10),
      to: rangeEnd.toISOString().slice(0, 10),
    });

    firstDate.setTime(rangeEnd.getTime());
    firstDate.setUTCDate(firstDate.getUTCDate() + 1);
  }

  return ranges;
}

function extractOwnerArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  for (const key of ['owners', 'ownerList', 'results', 'data']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of ['owners', 'ownerList', 'results']) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
      }
    }
  }
  return null;
}

export function resolveStaysFinanceOwner(
  payload: unknown,
  ownerId: string,
): StaysFinanceOwnerResolution {
  const owners = extractOwnerArray(payload);
  if (!owners) return { status: 'invalid-response' };

  const owner = owners.find((candidate): candidate is Record<string, unknown> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const record = candidate as Record<string, unknown>;
    return String(record._id || record.id || record.ownerId || record.owner_id || '').trim() === ownerId;
  });

  return owner ? { status: 'found', owner } : { status: 'not-found' };
}

export function normalizeStaysOwners(payload: unknown): StaysOwnerSummary[] | null {
  const rawOwners = extractOwnerArray(payload);
  if (!rawOwners) return null;

  const byId = new Map<string, StaysOwnerSummary>();
  for (const raw of rawOwners) {
    if (!raw || typeof raw !== 'object') continue;
    const owner = raw as Record<string, unknown>;
    const id = String(owner._id || owner.id || owner.ownerId || owner.owner_id || '').trim();
    if (!id || id.length > 160) continue;
    const name = String(owner.name || owner.fullName || owner.ownerName || owner.title || '').trim();
    const listings = Array.isArray(owner.listings) ? owner.listings : [];

    // Deliberately expose only a minimal directory record; never return finance or tax fields.
    byId.set(id, {
      id,
      name: name.slice(0, 160) || `Proprietário ${id.slice(-6)}`,
      propertyCount: listings.length,
    });
  }
  return [...byId.values()];
}
