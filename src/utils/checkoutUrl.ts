type StayParameters = {
  listingId: string;
  from: string;
  to: string;
  guests: { adults: number; children: number; infants: number; pets: number };
};

const ATTRIBUTION_PARAMETERS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_source_platform',
  'utm_campaign_id', 'utm_adset_id', 'utm_ad_id', 'utm_creative_format',
  'utm_marketing_tactic', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid',
] as const;
const NUMERIC_CAMPAIGN_ID_PARAMETERS = new Set([
  'utm_id', 'utm_campaign_id', 'utm_adset_id', 'utm_ad_id',
]);
const SAFE_ATTRIBUTION_VALUE_PATTERN = /^[\p{L}\p{N}._~%+ ,:/()&-]{1,100}$/u;

function isSafeAttributionValue(key: string, value: string): boolean {
  return SAFE_ATTRIBUTION_VALUE_PATTERN.test(value) &&
    (!key.startsWith('utm_') || NUMERIC_CAMPAIGN_ID_PARAMETERS.has(key) || !/^\d{7,}$/.test(value));
}

function copyAttribution(source: URLSearchParams, destination: URLSearchParams): void {
  for (const key of ATTRIBUTION_PARAMETERS) {
    const values = source.getAll(key);
    if (values.length === 1 && isSafeAttributionValue(key, values[0])) destination.set(key, values[0]);
  }
}

/** Recognize reservation codes without changing the case-sensitive order reference. */
export function existingReservationCodeFromPath(path: string): string | undefined {
  return /^\/checkout\/([A-Z0-9]{5})\/?$/i.exec(path)?.[1].toUpperCase();
}

/** Descriptive URL parameters only. The server remains authoritative for every booking and amount. */
export function checkoutUrlWithStay(path: string, stay: StayParameters, sourceSearch = '', currency = 'BRL'): string {
  const params = new URLSearchParams({ accommodation: stay.listingId, checkin: stay.from, checkout: stay.to });
  if (stay.guests.adults > 1) params.set('adults', String(stay.guests.adults));
  if (stay.guests.children > 0) params.set('children', String(stay.guests.children));
  if (stay.guests.infants > 0) params.set('infants', String(stay.guests.infants));
  if (stay.guests.pets > 0) params.set('pets', String(stay.guests.pets));
  const source = new URLSearchParams(sourceSearch);
  copyAttribution(source, params);
  params.set('currency', /^[A-Z]{3}$/.test(currency) ? currency : 'BRL');
  return `${path}?${params.toString()}`;
}

export type CheckoutStayFromUrl = StayParameters;

/** Read the public trip selection; price and availability always come from the backend. */
export function checkoutStayFromSearch(search: string): CheckoutStayFromUrl | null {
  const params = new URLSearchParams(search);
  const keys = ['accommodation', 'checkin', 'checkout', 'adults', 'children', 'infants', 'pets'];
  if (keys.some((key) => params.getAll(key).length > 1)) return null;
  const single = (key: string): string | null => params.get(key);
  const listingId = single('accommodation');
  const from = single('checkin');
  const to = single('checkout');
  const adults = Number(single('adults') ?? 1);
  const children = Number(single('children') ?? 0);
  const infants = Number(single('infants') ?? 0);
  const pets = Number(single('pets') ?? 0);
  const isDate = (value: string | null): value is string => value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  if (!listingId || !/^[A-Za-z0-9_-]{1,100}$/.test(listingId) || !isDate(from) || !isDate(to) ||
    to <= from || ![adults, children, infants, pets].every((count) => Number.isInteger(count) && count >= 0 && count <= 50) || adults < 1) {
    return null;
  }

  return { listingId, from, to, guests: { adults, children, infants, pets } };
}

export function checkoutPathWithStayQuery(path: string, search: string): string {
  const source = new URLSearchParams(search);
  const result = new URLSearchParams();
  for (const key of ['accommodation', 'checkin', 'checkout', 'guests', 'adults', 'children', 'infants', 'pets', 'currency']) {
    const values = source.getAll(key);
    if (values.length !== 1) continue;
    const value = values[0];
    const valid = key === 'accommodation' ? /^[A-Za-z0-9_-]{1,100}$/.test(value)
      : key === 'checkin' || key === 'checkout' ? /^\d{4}-\d{2}-\d{2}$/.test(value)
        : key === 'currency' ? /^[A-Z]{3}$/.test(value)
        : /^\d{1,2}$/.test(value) && Number(value) <= 50;
    if (valid) result.set(key, value);
  }
  copyAttribution(source, result);
  const query = result.toString();
  return query ? `${path}?${query}` : path;
}

export function existingReservationUrl(code: string, stay: {
  listingId: string | null; checkIn: string | null; checkOut: string | null;
  guests: number | null; adults: number | null; children: number | null; infants: number | null;
}, existingSearch = ''): string {
  const query = new URLSearchParams();
  if (typeof stay.listingId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(stay.listingId)) query.set('accommodation', stay.listingId);
  if (typeof stay.checkIn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn)) query.set('checkin', stay.checkIn);
  if (typeof stay.checkOut === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut)) query.set('checkout', stay.checkOut);
  for (const [key, value] of [['guests', stay.guests], ['adults', stay.adults], ['children', stay.children], ['infants', stay.infants]] as const) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 50) query.set(key, String(value));
  }
  copyAttribution(new URLSearchParams(existingSearch), query);
  const suffix = query.toString();
  return `/checkout/${encodeURIComponent(code)}${suffix ? `?${suffix}` : ''}`;
}
