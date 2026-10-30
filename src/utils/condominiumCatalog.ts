import type { Property } from '../types';

export interface CondominiumSummary {
  id: string;
  name: string;
  pageUrl?: string;
  description: string;
  images: string[];
  accommodationCount: number;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const cleanName = (value: string) => value.replace(/^\s*CRCN\s*[-–:]\s*/i, '').trim();

export function buildCondominiumCatalog(properties: Property[]): CondominiumSummary[] {
  const groups = new Map<string, Property[]>();

  for (const property of properties) {
    const name = cleanName(property.complexName || '');
    if (!name) continue;
    const key = property.staysPropertyId?.trim() || normalize(name);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(property);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([id, listings]) => {
      const name = cleanName(
        listings.find((property) => property.complexName)?.complexName || listings[0].title,
      );
      const description =
        listings
          .map((property) => property.complexDescription?.trim() || '')
          .sort((a, b) => b.length - a.length)[0] || '';
      const officialImages = [
        ...new Set(listings.flatMap((property) => property.complexImages || []).filter(Boolean)),
      ];
      return {
        id,
        name,
        pageUrl: /^[a-zA-Z0-9_-]{1,80}$/.test(listings[0].staysPropertyId || '')
          ? `/condominios/${encodeURIComponent(listings[0].staysPropertyId!)}`
          : undefined,
        description,
        images: officialImages.slice(0, 12),
        accommodationCount: listings.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
