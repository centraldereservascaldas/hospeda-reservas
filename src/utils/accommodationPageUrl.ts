import type { Property } from '../types';

export function accommodationPagePath(property: Property): string {
  const id = property.staysListingId || property.id;
  const prefix = `/apartamento/${encodeURIComponent(id)}`;
  const candidate = property.publicPagePath || '';
  if (
    candidate.startsWith(`${prefix}/`) &&
    /^[a-z0-9-]+$/.test(candidate.slice(prefix.length + 1))
  ) {
    return candidate;
  }
  return prefix;
}
