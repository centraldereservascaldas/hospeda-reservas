export interface StaysOwnerSummary {
  id: string;
  name: string;
  propertyCount: number;
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
