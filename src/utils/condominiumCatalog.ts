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
      const complexPageUrl = listings[0].complexPageUrl || '';
      const staysPropertyId = listings[0].staysPropertyId || '';
      const pageUrl = /^(?:\/pt\/building\/[a-zA-Z0-9_-]{1,80}\/[a-z0-9-]+|\/condominios\/[a-z0-9-]+)$/.test(
        complexPageUrl,
      )
        ? complexPageUrl
        : /^[a-zA-Z0-9_-]{1,80}$/.test(staysPropertyId)
          ? `/condominios/${encodeURIComponent(staysPropertyId)}`
          : undefined;
      return {
        id,
        name,
        pageUrl,
        description,
        images: officialImages.slice(0, 12),
        accommodationCount: listings.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
