export interface MeasurementAttributionConsent {
  analytics: boolean;
  advertising: boolean;
}

export interface AttributionTouch {
  capturedAt: number;
  values: Partial<Record<AttributionParameter, string>>;
}

export interface MeasurementAttribution {
  version: 1;
  expiresAt: number;
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
}

export type AttributionParameter =
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_content'
  | 'utm_term'
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'fbclid';

const STORAGE_KEY = 'crcn.measurementAttribution.v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SEARCH_LENGTH = 4096;
const MAX_VALUE_LENGTH = 100;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;
const ANALYTICS_PARAMETERS = new Set<AttributionParameter>([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);
const ADVERTISING_PARAMETERS = new Set<AttributionParameter>([
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
]);
const ALLOWED_PARAMETERS = new Set<AttributionParameter>([
  ...ANALYTICS_PARAMETERS,
  ...ADVERTISING_PARAMETERS,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeValues(value: unknown): Partial<Record<AttributionParameter, string>> {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Partial<Record<AttributionParameter, string>> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (
      ALLOWED_PARAMETERS.has(key as AttributionParameter) &&
      typeof candidate === 'string' &&
      candidate.length <= MAX_VALUE_LENGTH &&
      SAFE_VALUE_PATTERN.test(candidate)
    ) {
      sanitized[key as AttributionParameter] = candidate;
    }
  }

  return sanitized;
}

function sanitizeTouch(value: unknown): AttributionTouch | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.capturedAt) || !isRecord(value.values)) {
    return null;
  }

  return {
    capturedAt: value.capturedAt as number,
    values: sanitizeValues(value.values),
  };
}

function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function removeStoredAttribution(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restrictive browsing environments.
  }
}

function readStoredAttribution(now: number): MeasurementAttribution | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Number.isSafeInteger(parsed.expiresAt) ||
      (parsed.expiresAt as number) <= now
    ) {
      removeStoredAttribution();
      return null;
    }

    const firstTouch = sanitizeTouch(parsed.firstTouch);
    const lastTouch = sanitizeTouch(parsed.lastTouch);
    if (!firstTouch || !lastTouch) {
      removeStoredAttribution();
      return null;
    }

    return {
      version: 1,
      expiresAt: parsed.expiresAt as number,
      firstTouch,
      lastTouch,
    };
  } catch {
    removeStoredAttribution();
    return null;
  }
}

function writeStoredAttribution(attribution: MeasurementAttribution): void {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage may be unavailable in restrictive browsing environments.
  }
}

function collectAllowedParameters(
  search: string,
  consent: MeasurementAttributionConsent,
): Partial<Record<AttributionParameter, string>> {
  if (search.length > MAX_SEARCH_LENGTH) {
    return {};
  }

  const params = new URLSearchParams(search);
  const collected: Partial<Record<AttributionParameter, string>> = {};
  let allowedPairCount = 0;

  for (const [key] of params) {
    if (ALLOWED_PARAMETERS.has(key as AttributionParameter)) {
      allowedPairCount += 1;
    }
  }

  if (allowedPairCount > ALLOWED_PARAMETERS.size) {
    return {};
  }

  for (const key of ALLOWED_PARAMETERS) {
    const enabled = ANALYTICS_PARAMETERS.has(key)
      ? consent.analytics
      : ADVERTISING_PARAMETERS.has(key) && consent.advertising;
    if (!enabled) {
      continue;
    }

    const values = params.getAll(key);
    if (values.length !== 1) {
      continue;
    }

    const [candidate] = values;
    if (
      candidate !== undefined &&
      candidate.length <= MAX_VALUE_LENGTH &&
      SAFE_VALUE_PATTERN.test(candidate)
    ) {
      collected[key] = candidate;
    }
  }

  return collected;
}

function removeDisallowedValues(
  touch: AttributionTouch,
  consent: MeasurementAttributionConsent,
): AttributionTouch {
  const values = { ...touch.values };
  if (!consent.analytics) {
    for (const key of ANALYTICS_PARAMETERS) {
      delete values[key];
    }
  }
  if (!consent.advertising) {
    for (const key of ADVERTISING_PARAMETERS) {
      delete values[key];
    }
  }

  return { ...touch, values };
}

/** Captures consented URL parameters into session storage without sending them anywhere. */
export function updateMeasurementAttribution(
  consent: MeasurementAttributionConsent | null,
  search: string = window.location.search,
  now: number = Date.now(),
): MeasurementAttribution | null {
  if (!consent) {
    removeStoredAttribution();
    return null;
  }

  const existing = readStoredAttribution(now);
  const lastTouch = existing
    ? removeDisallowedValues(existing.lastTouch, consent)
    : { capturedAt: now, values: {} };
  const currentValues = collectAllowedParameters(search, consent);
  const hasCurrentValues = Object.keys(currentValues).length > 0;
  const initialFirstTouch = existing
    ? removeDisallowedValues(existing.firstTouch, consent)
    : { capturedAt: now, values: currentValues };

  const next: MeasurementAttribution = {
    version: 1,
    expiresAt: existing?.expiresAt ?? now + TTL_MS,
    firstTouch: initialFirstTouch,
    lastTouch: hasCurrentValues ? { capturedAt: now, values: currentValues } : lastTouch,
  };

  if (
    Object.keys(next.firstTouch.values).length === 0 &&
    Object.keys(next.lastTouch.values).length === 0
  ) {
    removeStoredAttribution();
    return null;
  }

  writeStoredAttribution(next);
  return next;
}

/** Reads the local record after enforcing its expiry and the supplied consent choices. */
export function readMeasurementAttribution(
  consent: MeasurementAttributionConsent | null,
  now: number = Date.now(),
): MeasurementAttribution | null {
  if (!consent) {
    removeStoredAttribution();
    return null;
  }

  const stored = readStoredAttribution(now);
  if (!stored) {
    return null;
  }

  const firstTouch = removeDisallowedValues(stored.firstTouch, consent);
  const lastTouch = removeDisallowedValues(stored.lastTouch, consent);
  if (Object.keys(firstTouch.values).length === 0 && Object.keys(lastTouch.values).length === 0) {
    removeStoredAttribution();
    return null;
  }

  return { ...stored, firstTouch, lastTouch };
}
