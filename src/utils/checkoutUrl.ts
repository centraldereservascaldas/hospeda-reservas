type StayParameters = {
  listingId: string;
  from: string;
  to: string;
  guests: { adults: number; children: number; infants: number; pets: number };
};

function copyAttribution(source: URLSearchParams, destination: URLSearchParams): void {
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid']) {
    const values = source.getAll(key);
    if (values.length === 1 && /^[A-Za-z0-9._~-]{1,100}$/.test(values[0])
      && (!key.startsWith('utm_') || !/^\d{7,}$/.test(values[0]))) destination.set(key, values[0]);
  }
}

/** Recognize reservation codes without changing the case-sensitive order reference. */
export function existingReservationCodeFromPath(path: string): string | undefined {
  return /^\/checkout\/([A-Z0-9]{5})\/?$/i.exec(path)?.[1].toUpperCase();
}

/** Descriptive URL parameters only. The server remains authoritative for every booking and amount. */
export function checkoutUrlWithStay(path: string, stay: StayParameters): string {
  const params = new URLSearchParams({
    imovel: stay.listingId,
    entrada: stay.from,
    saida: stay.to,
    adultos: String(stay.guests.adults),
    criancas: String(stay.guests.children),
    bebes: String(stay.guests.infants),
    pets: String(stay.guests.pets),
  });
  return `${path}?${params.toString()}`;
}

export function checkoutPathWithStayQuery(path: string, search: string): string {
  const source = new URLSearchParams(search);
  const result = new URLSearchParams();
  for (const key of ['imovel', 'entrada', 'saida', 'hospedes', 'adultos', 'criancas', 'bebes', 'pets']) {
    const values = source.getAll(key);
    if (values.length !== 1) continue;
    const value = values[0];
    const valid = key === 'imovel' ? /^[A-Za-z0-9_-]{1,100}$/.test(value)
      : key === 'entrada' || key === 'saida' ? /^\d{4}-\d{2}-\d{2}$/.test(value)
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
  if (typeof stay.listingId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(stay.listingId)) query.set('imovel', stay.listingId);
  if (typeof stay.checkIn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn)) query.set('entrada', stay.checkIn);
  if (typeof stay.checkOut === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut)) query.set('saida', stay.checkOut);
  for (const [key, value] of [['hospedes', stay.guests], ['adultos', stay.adults], ['criancas', stay.children], ['bebes', stay.infants]] as const) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 50) query.set(key, String(value));
  }
  copyAttribution(new URLSearchParams(existingSearch), query);
  const suffix = query.toString();
  return `/checkout/${encodeURIComponent(code)}${suffix ? `?${suffix}` : ''}`;
}
