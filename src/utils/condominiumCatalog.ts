import type { Property } from '../types';

export interface CondominiumSummary {
  id: string;
  name: string;
  pageUrl?: string;
  description: string;
  images: string[];
  accommodationCount: number;
  source?: 'stays' | 'imobsys';
}

const lowercaseNameParticles = new Set([
  'a',
  'as',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'para',
  'por',
]);

/** Formats provider names for display without changing their identity or source data. */
export function formatCondominiumName(value: string): string {
  const trimmed = cleanName(value);
  if (!trimmed || trimmed !== trimmed.toLocaleUpperCase('pt-BR')) return trimmed;

  return trimmed
    .toLocaleLowerCase('pt-BR')
    .split(/(\s+|[-/])/)
    .map((part, index) => {
      if (/^\s+$|^[-/]$/.test(part)) return part;
      const normalized = part.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (index > 0 && lowercaseNameParticles.has(normalized)) return part;
      if (/^\d+(?:º|ª)?$/.test(part) || /^(?:ii|iii|iv|vi|vii|viii|ix|x)$/i.test(part)) {
        return part.toLocaleUpperCase('pt-BR');
      }
      if (normalized === 'diroma') return 'diRoma';
      return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1);
    })
    .join('');
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const cleanName = (value: string) => value.replace(/^\s*CRCN\s*[-–:]\s*/i, '').trim();

export function buildCondominiumCatalog(
  properties: Property[],
  partnerResorts: Array<{ id: string; name: string }> = [],
): CondominiumSummary[] {
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

  const staysCondominiums: CondominiumSummary[] = [...groups.entries()].map(([id, listings]) => {
    const rawName = cleanName(
      listings.find((property) => property.complexName)?.complexName || listings[0].title,
    );
    const name = formatCondominiumName(rawName);
    const description =
      listings
        .map((property) => property.complexDescription?.trim() || '')
        .sort((a, b) => b.length - a.length)[0] || '';
    const officialImages = [
      ...new Set(listings.flatMap((property) => property.complexImages || []).filter(Boolean)),
    ];
    const complexPageUrl = listings[0].complexPageUrl || '';
    const staysPropertyId = listings[0].staysPropertyId || '';
    const pageUrl =
      /^(?:\/pt\/building\/[a-zA-Z0-9_-]{1,80}\/[a-z0-9-]+|\/condominios\/[a-z0-9-]+)$/.test(
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
      source: 'stays',
    };
  });
  const knownStaysNames = new Set(
    [...groups.values()].map((listings) =>
      normalize(
        cleanName(
          listings.find((property) => property.complexName)?.complexName || listings[0].title,
        ),
      ),
    ),
  );
  const partnerCondominiums: CondominiumSummary[] = partnerResorts
    .filter((resort) => resort.id.startsWith('imobsys-condo-'))
    .filter((resort) => !knownStaysNames.has(normalize(cleanName(resort.name))))
    .map((resort) => ({
      id: resort.id,
      name: formatCondominiumName(resort.name),
      description: 'Condomínio da rede parceira. Consulte as opções para as datas da viagem.',
      images: [],
      accommodationCount: 0,
      source: 'imobsys' as const,
      pageUrl: `/?query=${encodeURIComponent(resort.name)}&category=condominiums#stays-apartments-catalog`,
    }));

  return [...staysCondominiums, ...partnerCondominiums].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  );
}
