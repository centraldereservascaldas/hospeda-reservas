import type { Property } from '../types';
import { isProperty, isRecord } from './apiValidation';
import { sanitizePropertyMedia } from './propertyMedia';

const DATA_KEY = 'hospeda_properties';
const SOURCE_KEY = 'hospeda_properties_source';
const META_KEY = 'hospeda_properties_meta';
const VERSION = 1;
const TTL_MS = 15 * 60_000;
const MAX_PROPERTIES = 100;
const MAX_CHARACTERS = 1_048_576;

export function clearAccommodationCatalogCache(): void {
  try {
    for (const key of [DATA_KEY, SOURCE_KEY, META_KEY]) localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable; it must not prevent live catalog requests.
  }
}

function readDeadline(): number | null {
  const meta: unknown = JSON.parse(localStorage.getItem(META_KEY) || 'null');
  return isRecord(meta) &&
    meta.version === VERSION &&
    typeof meta.expiresAt === 'number' &&
    Number.isFinite(meta.expiresAt) &&
    meta.expiresAt > Date.now() &&
    meta.expiresAt <= Date.now() + TTL_MS
    ? meta.expiresAt
    : null;
}

export function readAccommodationCatalogCache(): Property[] {
  try {
    const deadline = readDeadline();
    const saved = localStorage.getItem(DATA_KEY);
    if (
      !deadline ||
      !saved ||
      saved.length > MAX_CHARACTERS ||
      localStorage.getItem(SOURCE_KEY) !== 'stays-live'
    ) {
      clearAccommodationCatalogCache();
      return [];
    }
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length > MAX_PROPERTIES) {
      clearAccommodationCatalogCache();
      return [];
    }
    return parsed
      .filter(isProperty)
      .filter((property) => !property.id.startsWith('prop-'))
      .map((property) => ({ ...sanitizePropertyMedia(property), calculatedPrice: undefined }));
  } catch {
    clearAccommodationCatalogCache();
    return [];
  }
}

export function writeAccommodationCatalogCache(
  properties: Property[],
  source: string,
  expiresAt = Date.now() + TTL_MS,
): void {
  try {
    const saved = JSON.stringify(
      properties.slice(0, MAX_PROPERTIES).map((property) => ({
        ...sanitizePropertyMedia(property),
        calculatedPrice: undefined,
      })),
    );
    if (!properties.length || saved.length > MAX_CHARACTERS) {
      clearAccommodationCatalogCache();
      return;
    }
    // Publish metadata last so a failed write cannot make a partial update valid.
    localStorage.removeItem(META_KEY);
    localStorage.setItem(DATA_KEY, saved);
    localStorage.setItem(SOURCE_KEY, source);
    localStorage.setItem(META_KEY, JSON.stringify({ version: VERSION, expiresAt }));
  } catch {
    clearAccommodationCatalogCache();
  }
}

export function updateAccommodationCatalogCache(property: Property): void {
  const cached = readAccommodationCatalogCache();
  let expiresAt: number | null = null;
  try {
    expiresAt = readDeadline();
  } catch {
    /* A new snapshot will be bounded below. */
  }
  const index = cached.findIndex(
    (item) =>
      item.id === property.id ||
      Boolean(property.staysListingId && item.staysListingId === property.staysListingId),
  );
  if (index >= 0) cached[index] = property;
  else cached.unshift(property);
  writeAccommodationCatalogCache(
    cached,
    property.dataSource ?? 'stays-live',
    expiresAt ?? undefined,
  );
}
