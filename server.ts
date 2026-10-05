import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createClient, User } from '@supabase/supabase-js';
import { STAYS_NET_APARTMENTS } from './src/data/staysApartments';
import { Property } from './src/types';
import { hasQuoteChanged, normalizeStaysQuote } from './src/utils/staysPricing';
import { extractStaysImages, mergeStaysImageSources } from './src/utils/staysImages';
import { normalizeStaysGuestReview, StaysGuestReviewRecord, summarizeStaysReviews } from './src/utils/staysReviews';

// Node 20+ natively loads the local environment file before configuration is read.
try {
  process.loadEnvFile('.env');
} catch {
  // Keep defaults when running without a local .env file.
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SERVE_DIST = process.env.NODE_ENV === 'production' || process.argv.includes('--serve-dist');

// Configuration from environment
const STAYS_BASE_URL = process.env.STAYS_BASE_URL || 'https://crcn.stays.net/external/v1';
const STAYS_CLIENT_ID = process.env.STAYS_CLIENT_ID || '';
const STAYS_CLIENT_SECRET = process.env.STAYS_CLIENT_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null;

app.use(cors());
app.use(express.json());

// In-memory cache for live Stays PMS synchronized properties
let cachedProperties: Property[] = [...STAYS_NET_APARTMENTS];
let cachedStaysPropertyNames = new Map<string, string>();
let cachedStaysReviews: { byListing: Map<string, Property['reviews']>; expiresAt: number } | null = null;
let staysReviewsRequest: Promise<Map<string, Property['reviews']> | null> | null = null;

const STAYS_REVIEWS_CACHE_MS = 15 * 60 * 1000;
const STAYS_REVIEWS_PAGE_SIZE = 100;
const STAYS_REVIEWS_MAX_PAGES = 20;

async function fetchStaysReviewIndex(): Promise<Map<string, Property['reviews']> | null> {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) return null;
  if (cachedStaysReviews && cachedStaysReviews.expiresAt > Date.now()) {
    return cachedStaysReviews.byListing;
  }
  if (staysReviewsRequest) return staysReviewsRequest;

  staysReviewsRequest = (async () => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 364 * 24 * 60 * 60 * 1000);
    const to = toDate.toISOString().slice(0, 10);
    const from = fromDate.toISOString().slice(0, 10);
    const byListing = new Map<string, Property['reviews']>();

    for (let page = 0; page < STAYS_REVIEWS_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        from,
        to,
        limit: String(STAYS_REVIEWS_PAGE_SIZE),
        page: String(page),
      });
      const response = await callStaysExternalApi<{ reviewList?: StaysGuestReviewRecord[] }>(`/reviews/guest?${query}`);
      if (!response || !Array.isArray(response.reviewList)) return null;

      for (const rawReview of response.reviewList) {
        const propertyObjectId = String(rawReview?.apartment?._id || '');
        if (!propertyObjectId) continue;
        const review = normalizeStaysGuestReview(rawReview);
        if (!review) continue;
        const listingReviews = byListing.get(propertyObjectId) || [];
        listingReviews.push(review);
        byListing.set(propertyObjectId, listingReviews);
      }

      if (response.reviewList.length < STAYS_REVIEWS_PAGE_SIZE) {
        cachedStaysReviews = { byListing, expiresAt: Date.now() + STAYS_REVIEWS_CACHE_MS };
        return byListing;
      }
    }

    // Fail closed rather than displaying an incomplete aggregate if the safety cap is hit.
    console.warn('Stays reviews pagination exceeded the configured safety cap; omitting review data.');
    return null;
  })();

  try {
    return await staysReviewsRequest;
  } finally {
    staysReviewsRequest = null;
  }
}

function attachStaysReviews(property: Property, reviewIndex: Map<string, Property['reviews']> | null): Property {
  if (!reviewIndex) {
    return { ...property, rating: 0, reviewCount: 0, reviews: [], reviewsSynced: false };
  }
  const reviews = reviewIndex.get(String(property.staysListingObjectId || '')) || [];
  const summary = summarizeStaysReviews(reviews);
  return { ...property, ...summary, reviews, reviewsSynced: true };
}

const localizedText = (value: any): string => {
  if (typeof value === 'string') return value;
  return value?.pt_BR || value?.pt_PT || value?.en_US || '';
};

const stripHtml = (value: string): string =>
  value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

const customerFacingText = (value: string): string =>
  value
    .replace(/\bPMS\s+Stays(?:\.net)?\b/gi, 'sistema de reservas')
    .replace(/\bStays(?:\.net)?\s+PMS\b/gi, 'sistema de reservas')
    .replace(/\bStays(?:\.net)?\b/gi, 'Central de Reservas')
    .replace(/\bPMS\b/gi, 'sistema de reservas')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const stayNights = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

async function getLiveQuote(listingId: string, from: string, to: string, guests: number, promocode?: string) {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) return null;
  const result = await callStaysExternalApi<any>('/booking/calculate-price', {
    method: 'POST',
    body: JSON.stringify({ from, to, listingIds: [listingId], guests, ...(promocode ? { promocode } : {}) }),
  });
  const raw = Array.isArray(result)
    ? result.find((entry: any) => entry?._idlisting === listingId) || result[0]
    : result;
  return normalizeStaysQuote(raw, stayNights(from, to));
}

async function checkLiveAvailability(listingId: string, from: string, to: string, guests: number): Promise<boolean | null> {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) return null;
  const results = await callStaysExternalApi<any>('/booking/search-listings', {
    method: 'POST',
    body: JSON.stringify({ from, to, guests, listingId, limit: 100, skip: 0 }),
  });
  if (!Array.isArray(results)) return null;
  return results.some((listing: any) =>
    [listing?.id, listing?._id, listing?.code].some((id) => String(id || '') === listingId)
  );
}

function mapStaysListing(l: any, existing?: Property): Property {
  const shortId = l.id || l.code || l._id;
  const staysImages = extractStaysImages(l);
  const mainImage = l._t_mainImageMeta?.url || l.mainImage?.url || staysImages[0];
  const bookingTotal = l.bookingPrice?._mctotal?.BRL;
  const lat = l.latLng?.lat ?? l.latLng?._f_lat;
  const lng = l.latLng?.lng ?? l.latLng?._f_lng;
  const description = customerFacingText(localizedText(l._msdesc || l.description) || existing?.description || '');
  const staysPropertyId = l._idproperty || l.property?._id || existing?.staysPropertyId;
  const complexName = localizedText(l._t_propertyMeta?._mstitle || l.property?._mstitle)
    || cachedStaysPropertyNames.get(String(staysPropertyId || ''))
    || existing?.complexName;

  return {
    ...(existing || {}),
    id: shortId,
    staysListingObjectId: String(l._id || existing?.staysListingObjectId || ''),
    staysPropertyId,
    complexName,
    staysListingId: shortId,
    staysSynced: true,
    title: customerFacingText(localizedText(l._mstitle || l.title) || l.internalName || existing?.title || 'Apartamento Central de Reservas'),
    subtitle: customerFacingText(localizedText(l._t_typeMeta?._mstitle) || existing?.subtitle || 'Caldas Novas - GO'),
    description: stripHtml(description),
    category: existing?.category || l.listingCategories?.[0] || 'resorts_flats',
    propertyType: l.subtype === 'private_room' ? 'private_room' : 'entire_place',
    location: {
      city: l.address?.city || existing?.location.city || 'Caldas Novas',
      state: l.address?.state || existing?.location.state || 'Goiás',
      country: existing?.location.country || 'Brasil',
      neighborhood: l.address?.region || l.address?.neighborhood || existing?.location.neighborhood || '',
      address: [l.address?.street, l.address?.streetNumber, l.address?.additional].filter(Boolean).join(', ') || existing?.location.address || '',
      lat: lat ?? existing?.location.lat ?? -17.74,
      lng: lng ?? existing?.location.lng ?? -48.62,
    },
    pricePerNight: l.dailyRate || (bookingTotal && l.bookingPrice?.from && l.bookingPrice?.to
      ? bookingTotal / Math.max(1, Math.ceil((new Date(l.bookingPrice.to).getTime() - new Date(l.bookingPrice.from).getTime()) / 86400000))
      : 0) || l.price || existing?.pricePerNight || 0,
    cleaningFee: l.cleaningFee ?? existing?.cleaningFee ?? 0,
    serviceFeeRate: existing?.serviceFeeRate ?? 0.10,
    rating: 0,
    reviewCount: 0,
    isSuperhost: false,
    isGuestFavorite: false,
    instantBook: l.instantBooking ?? existing?.instantBook ?? false,
    images: [...new Set([
      mainImage,
      ...staysImages,
      ...(existing?.images || []),
    ].filter((url): url is string => Boolean(url)))],
    bedrooms: l._i_rooms ?? existing?.bedrooms ?? 0,
    beds: l._i_beds ?? existing?.beds ?? 0,
    bathrooms: l._f_bathrooms ?? existing?.bathrooms ?? 1,
    maxGuests: l._i_maxGuests ?? existing?.maxGuests ?? 1,
    amenities: (existing?.amenities || []).map(customerFacingText),
    listingAmenities: (existing?.listingAmenities || []).map(customerFacingText),
    propertyAmenities: (existing?.propertyAmenities || []).map(customerFacingText),
    highlights: (existing?.highlights || []).map((highlight) => ({
      ...highlight,
      title: customerFacingText(highlight.title || ''),
      description: customerFacingText(highlight.description || ''),
    })),
    sleepingArrangements: existing?.sleepingArrangements || [],
    rules: (existing?.rules || []).map(customerFacingText),
    host: existing?.host ? {
      ...existing.host,
      bio: customerFacingText(existing.host.bio || ''),
    } : {
      name: 'Central de Reservas Caldas Novas',
      avatar: '',
      joinedYear: new Date().getFullYear(),
      isSuperhost: false,
      responseTime: 'não informado',
      responseRate: 'não informado',
      bio: '',
    },
    reviews: [],
    reviewsSynced: false,
  };
}

// Helper to make authenticated requests to Stays External API if credentials configured
async function callStaysExternalApi<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) {
    return null;
  }
  try {
    const configuredBase = STAYS_BASE_URL.replace(/\/+$/, '');
    const apiBase = /\/external\/v1$/i.test(configuredBase) ? configuredBase : `${configuredBase}/external/v1`;
    const url = `${apiBase}/${endpoint.replace(/^\//, '')}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${STAYS_CLIENT_ID}:${STAYS_CLIENT_SECRET}`).toString('base64')}`,
      ...(options.headers || {}),
    };
    const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      console.warn(`Stays API [${endpoint}] returned HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.error(`Error calling Stays API [${endpoint}]:`, err);
    return null;
  }
}

type VerifiedGuest = { id: string; email: string; fullName: string; user: User };

async function authenticateVerifiedGuest(req: Request): Promise<{
  guest?: VerifiedGuest;
  status?: number;
  code?: string;
  message?: string;
}> {
  if (!supabaseAdmin) {
    return { status: 503, code: 'auth_not_configured', message: 'O acesso de hóspedes ainda não está configurado.' };
  }
  const authorization = req.headers.authorization || '';
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!token) {
    return { status: 401, code: 'authentication_required', message: 'Entre na sua conta para continuar.' };
  }
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const user = data.user;
    if (error || !user || !user.email) {
      return { status: 401, code: 'invalid_session', message: 'Sua sessão expirou. Entre novamente.' };
    }
    if (!user.email_confirmed_at) {
      return { status: 403, code: 'email_not_confirmed', message: 'Confirme seu e-mail antes de continuar.' };
    }
    const fullName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
    if (fullName.split(/\s+/).filter(Boolean).length < 2) {
      return { status: 403, code: 'profile_name_required', message: 'Atualize seu nome completo antes de reservar.' };
    }
    return { guest: { id: user.id, email: user.email.trim().toLowerCase(), fullName, user } };
  } catch {
    return { status: 503, code: 'auth_unavailable', message: 'Não foi possível validar sua sessão agora.' };
  }
}

async function staysGuestRequest<T>(endpoint: string, method = 'GET', body?: unknown): Promise<{
  ok: boolean;
  status: number;
  data?: T;
}> {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) return { ok: false, status: 503 };
  try {
    const configuredBase = STAYS_BASE_URL.replace(/\/+$/, '');
    const apiBase = /\/external\/v1$/i.test(configuredBase) ? configuredBase : `${configuredBase}/external/v1`;
    const response = await fetch(`${apiBase}/${endpoint.replace(/^\//, '')}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${STAYS_CLIENT_ID}:${STAYS_CLIENT_SECRET}`).toString('base64')}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let data: T | undefined;
    try { data = JSON.parse(text) as T; } catch { data = undefined; }
    return { ok: response.ok, status: response.status, data };
  } catch {
    // Do not log a request URL/body here: these calls can contain guest PII.
    return { ok: false, status: 502 };
  }
}

const guestSyncRequests = new Map<string, Promise<{ ok: boolean; code?: string }>>();

async function syncVerifiedGuestToStays(guest: VerifiedGuest): Promise<{ ok: boolean; code?: string }> {
  if (!supabaseAdmin) return { ok: false, code: 'auth_not_configured' };
  const activeRequest = guestSyncRequests.get(guest.id);
  if (activeRequest) return activeRequest;

  const request = (async (): Promise<{ ok: boolean; code?: string }> => {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('guest_profiles')
      .select('stays_client_id')
      .eq('id', guest.id)
      .maybeSingle();
    if (profileError) return { ok: false, code: 'profile_storage_unavailable' };
    if (profile?.stays_client_id) return { ok: true };

    const query = new URLSearchParams({ email: guest.email, limit: '20' });
    const lookup = await staysGuestRequest<any>(`/booking/clients?${query}`);
    if (!lookup.ok) return { ok: false, code: 'stays_client_lookup_failed' };
    const clients = Array.isArray(lookup.data)
      ? lookup.data
      : Array.isArray(lookup.data?.clients) ? lookup.data.clients : [];
    const existingClient = clients.find((client: any) =>
      String(client?.email || '').trim().toLowerCase() === guest.email
    );

    let staysClientId = String(existingClient?._id || '');
    if (existingClient && existingClient.isUser !== true) {
      const activated = await staysGuestRequest<any>(
        `/booking/clients/${encodeURIComponent(staysClientId)}`,
        'PATCH',
        { isUser: true },
      );
      if (!activated.ok) return { ok: false, code: 'stays_client_activation_failed' };
    } else if (!existingClient) {
      const nameParts = guest.fullName.split(/\s+/).filter(Boolean);
      const created = await staysGuestRequest<any>('/booking/clients', 'POST', {
        kind: 'person',
        fName: nameParts[0],
        lName: nameParts.slice(1).join(' '),
        email: guest.email,
        isUser: true,
        prefLang: 'pt_BR',
      });
      staysClientId = String(created.data?._id || '');
      if (!created.ok || !staysClientId) {
        // If a concurrent registration created the same client, resolve it with an exact email match.
        const retry = await staysGuestRequest<any>(`/booking/clients?${query}`);
        const retryClients = Array.isArray(retry.data)
          ? retry.data
          : Array.isArray(retry.data?.clients) ? retry.data.clients : [];
        const duplicate = retryClients.find((client: any) =>
          String(client?.email || '').trim().toLowerCase() === guest.email
        );
        if (!retry.ok || !duplicate?._id) return { ok: false, code: 'stays_client_create_failed' };
        staysClientId = String(duplicate._id);
        if (duplicate.isUser !== true) {
          const activated = await staysGuestRequest<any>(
            `/booking/clients/${encodeURIComponent(staysClientId)}`,
            'PATCH',
            { isUser: true },
          );
          if (!activated.ok) return { ok: false, code: 'stays_client_activation_failed' };
        }
      }
    }

    if (!staysClientId) return { ok: false, code: 'stays_client_create_failed' };
    const { error: saveError } = await supabaseAdmin.from('guest_profiles').upsert({
      id: guest.id,
      full_name: guest.fullName,
      stays_client_id: staysClientId,
      stays_synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (saveError) return { ok: false, code: 'profile_storage_unavailable' };
    return { ok: true };
  })();

  guestSyncRequests.set(guest.id, request);
  try {
    return await request;
  } finally {
    guestSyncRequests.delete(guest.id);
  }
}

async function getLinkedStaysClientId(guest: VerifiedGuest): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('guest_profiles')
    .select('stays_client_id')
    .eq('id', guest.id)
    .maybeSingle();
  if (error) return null;
  if (data?.stays_client_id) return String(data.stays_client_id);

  const sync = await syncVerifiedGuestToStays(guest);
  if (!sync.ok) return null;
  const { data: linked } = await supabaseAdmin
    .from('guest_profiles')
    .select('stays_client_id')
    .eq('id', guest.id)
    .maybeSingle();
  return linked?.stays_client_id ? String(linked.stays_client_id) : null;
}

function clientReservations(client: any): any[] {
  if (Array.isArray(client?.reservations)) return client.reservations;
  if (Array.isArray(client?.data?.reservations)) return client.data.reservations;
  return [];
}

function mapStaysGuestReservation(record: any): any | null {
  const staysId = String(record?.id || record?._id || '').trim();
  const checkIn = String(record?.checkInDate || '');
  const checkOut = String(record?.checkOutDate || '');
  if (!staysId || !isIsoDate(checkIn) || !isIsoDate(checkOut)) return null;

  const rawType = String(record?.type || '').toLowerCase();
  const status = ['canceled', 'cancelled'].includes(rawType)
    ? 'cancelled'
    : ['booked', 'reserved', 'contract'].includes(rawType) ? 'confirmed' : null;
  if (!status) return null;

  const propertyId = String(record?._idlisting || '');
  const property = cachedProperties.find((item) => item.staysListingId === propertyId || item.id === propertyId);
  const nights = Math.max(1, stayNights(checkIn, checkOut));
  const total = Number(record?.price?._f_total ?? record?.price?.hostingDetails?._f_total ?? 0) || 0;
  const nightRate = Number(record?.price?.hostingDetails?._f_nightPrice ?? 0) || total / nights;
  const fees = [
    ...(Array.isArray(record?.fees) ? record.fees : []),
    ...(Array.isArray(record?.price?.hostingDetails?.fees) ? record.price.hostingDetails.fees : []),
  ];
  const cleaningFee = fees.reduce((sum: number, fee: any) => {
    const label = `${fee?.name || ''} ${fee?._mstitle?.pt_BR || ''}`.toLowerCase();
    return /limpez|clean/.test(label) ? sum + (Number(fee?._f_val ?? fee?._mcval?.BRL ?? 0) || 0) : sum;
  }, 0);
  const bookedName = String(record?.bookerDetails?.name || record?.guestsDetails?.list?.find((g: any) => g?.primary)?.name || '');
  const bookedEmail = String(record?.bookerDetails?.email || record?.guestsDetails?.list?.find((g: any) => g?.primary)?.email || '');
  const today = new Date().toISOString().slice(0, 10);
  const finalStatus = status === 'confirmed' && checkOut < today ? 'completed' : status;

  return {
    id: staysId,
    code: staysId,
    propertyId,
    propertyTitle: property?.title || String(record?._mslistingTitle?.pt_BR || 'Acomodação'),
    propertyLocation: property?.subtitle || '',
    propertyImage: property?.images?.[0] || STAYS_NET_APARTMENTS[0]?.images?.[0] || '',
    checkIn,
    checkOut,
    nights,
    guests: {
      adults: Number(record?.guestsDetails?.adults ?? record?.guests ?? 1) || 1,
      children: Number(record?.guestsDetails?.children || 0),
      infants: Number(record?.guestsDetails?.infants || 0),
      pets: 0,
    },
    pricePerNight: nightRate,
    cleaningFee,
    serviceFee: 0,
    discount: 0,
    totalAmount: total,
    paymentMethod: 'pix',
    status: finalStatus,
    createdAt: String(record?.creationDate || ''),
    hostName: 'Central de Reservas Caldas Novas',
    guestName: bookedName,
    guestEmail: bookedEmail,
    guestPhone: '',
    staysReservationId: staysId,
    staysLocator: String(record?.partnerCode || ''),
    staysSyncStatus: 'synced',
  };
}

async function fetchStaysProperties(): Promise<any[] | null> {
  if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) return null;
  const properties: any[] = [];
  for (let skip = 0; skip < 5000; skip += 20) {
    const page = await callStaysExternalApi<any[]>(`/content/properties?status=active&limit=20&skip=${skip}`);
    if (!Array.isArray(page)) return properties.length ? properties : null;
    properties.push(...page);
    if (page.length < 20) break;
  }
  return properties;
}

function indexStaysPropertyNames(properties: any[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const property of properties) {
    const name = localizedText(property?._mstitle) || property?.internalName || '';
    if (!name.trim()) continue;
    if (property?._id) result.set(String(property._id), name.trim());
    if (property?.id) result.set(String(property.id), name.trim());
  }
  return result;
}

app.get('/api/resorts', async (_req: Request, res: Response) => {
  try {
    const properties = await fetchStaysProperties();
    if (!properties) {
      return res.status(503).json({ success: false, source: 'unavailable', data: [] });
    }
    cachedStaysPropertyNames = indexStaysPropertyNames(properties);
    const resorts = properties
      .map((property: any) => ({
        id: String(property?._id || property?.id || ''),
        name: localizedText(property?._mstitle) || property?.internalName || '',
      }))
      .filter((property: { id: string; name: string }) => property.id && property.name.trim())
      .filter((property: { id: string; name: string }, index: number, all: { id: string; name: string }[]) =>
        all.findIndex((item) => item.id === property.id) === index
      )
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR'));
    return res.json({ success: true, source: 'stays-live', total: resorts.length, data: resorts });
  } catch (error) {
    return res.status(500).json({ success: false, source: 'unavailable', error: (error as Error).message, data: [] });
  }
});

// 1. GET /api/accommodations -> Stays /content/listings
app.get('/api/accommodations', async (_req: Request, res: Response) => {
  try {
    const staysProperties = await fetchStaysProperties();
    if (staysProperties) cachedStaysPropertyNames = indexStaysPropertyNames(staysProperties);
    // Fetch only active listings and paginate: Stays caps each response page.
    const liveListings: any[] = [];
    if (STAYS_CLIENT_ID && STAYS_CLIENT_SECRET) {
      for (let skip = 0; skip < 5000; skip += 50) {
        const page = await callStaysExternalApi<any[]>(`/content/listings?limit=50&skip=${skip}&status=active`);
        if (!Array.isArray(page)) break;
        liveListings.push(...page);
        if (page.length < 50) break;
      }
    }
    if (liveListings && Array.isArray(liveListings) && liveListings.length > 0) {
      // The collection endpoint only includes the cover. Fetch each detail record to get
      // the full _t_imagesMeta gallery, then normalize everything into the site's model.
      const mapListing = async (l: any, idx: number): Promise<Property> => {
        const listingId = l.id || l.code || l._id || `stays-${idx + 1}`;
        const existing = cachedProperties.find(p =>
          p.id === listingId || p.staysListingId === listingId || p.id === l._id || p.staysListingId === l._id
        );
        const detailId = l._id || l.id || l.code || listingId;
        const detail = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(detailId)}`);
        const completeListing = detail ? { ...l, ...detail } : l;
        const property = mapStaysListing(completeListing, existing);
        const gallery = mergeStaysImageSources(detail, l);
        if (gallery.length > 0) property.images = gallery;
        else if (existing?.images?.length) property.images = existing.images;
        return property;
      };
      const mapped: Property[] = [];
      for (let index = 0; index < liveListings.length; index += 5) {
        mapped.push(...await Promise.all(liveListings.slice(index, index + 5).map(mapListing)));
      }
      const reviewIndex = await fetchStaysReviewIndex();
      const withReviews = mapped.map((property) => attachStaysReviews(property, reviewIndex));
      cachedProperties = withReviews;
      return res.json({ success: true, source: 'stays-live', count: withReviews.length, data: withReviews });
    }

    // Default fallback to high-fidelity CRCN Stays PMS catalog
    return res.json({
      success: true,
      source: 'local-catalog',
      count: cachedProperties.length,
      data: cachedProperties,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 2. GET /api/accommodations/:id -> Stays /content/listings/:id + /listing-rooms/:id
app.get('/api/accommodations/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    let property = cachedProperties.find(p => p.id === id || p.staysListingId === id);

    // Deep links may use either Stays short ID or internal ID. If the detailed
    // endpoint rejects the short code, resolve that code against the account list.
    let liveListing = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(id)}`);
    if (!liveListing && STAYS_CLIENT_ID && STAYS_CLIENT_SECRET) {
      for (let skip = 0; skip < 5000 && !liveListing; skip += 50) {
        const page = await callStaysExternalApi<any[]>(`/content/listings?limit=50&skip=${skip}&status=active`);
        if (!Array.isArray(page) || page.length === 0) break;
        const match = page.find((item: any) => [item.id, item.code, item._id].includes(id));
        if (match) {
          const detailKey = match._id || match.id || match.code;
          liveListing = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(detailKey)}`) || match;
          break;
        }
        if (page.length < 50) break;
      }
    }
    if (liveListing) {
      const existing = cachedProperties.find(p =>
        p.id === liveListing.id || p.staysListingId === liveListing.id ||
        p.id === liveListing._id || p.staysListingId === liveListing._id ||
        p.id === id || p.staysListingId === id
      );
      const mapped = mapStaysListing(liveListing, existing);
      const liveImages = extractStaysImages(liveListing);
      if (liveImages.length > 0) mapped.images = liveImages;
      else if (existing?.images?.length) mapped.images = existing.images;
      if (mapped.images.length === 0 && liveListing._t_mainImageMeta?.url) {
        mapped.images = [liveListing._t_mainImageMeta.url];
      }
      property = mapped;
      const cacheIndex = cachedProperties.findIndex(p => p.id === mapped.id || p.staysListingId === mapped.staysListingId);
      if (cacheIndex >= 0) cachedProperties[cacheIndex] = mapped;
      else cachedProperties.push(mapped);
    }

    if (!property) {
      return res.status(404).json({ success: false, message: 'Acomodação não encontrada na base Stays.' });
    }

    // Attempt live rooms and amenities fetch if connected
    const liveRooms = await callStaysExternalApi<any[]>(`/content/listing-rooms/${encodeURIComponent(liveListing?.id || property.staysListingId || id)}`);
    let rooms = property.sleepingArrangements;
    if (liveRooms && Array.isArray(liveRooms)) {
      rooms = liveRooms.map((r, i) => ({
        roomName: r.name || `Quarto ${i + 1}`,
        bedType: r.beds ? r.beds.map((b: any) => `${b.count} ${b.type}`).join(', ') : '1 cama de casal',
        icon: 'BedDouble',
      }));
    }

    const reviewIndex = await fetchStaysReviewIndex();
    property = attachStaysReviews(property, reviewIndex);
    const cachedPropertyIndex = cachedProperties.findIndex((item) => item.id === property?.id);
    if (cachedPropertyIndex >= 0) cachedProperties[cachedPropertyIndex] = property;

    return res.json({
      success: true,
      data: {
        ...property,
        sleepingArrangements: rooms,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Helper to normalize strings (remove accents and apostrophes like L'acqua / L’acqua)
const normalize = (str: string) =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, '')
    .trim();

// 3. POST /api/search -> Stays /booking/search-listings
app.post('/api/search', async (req: Request, res: Response) => {
  try {
    const { from, to, guests, destination, propertyId, cities, limit = 20, skip = 0 } = req.body;
    const guestCount = parseInt(guests, 10) || 1;

    // Prefer the authoritative Stays availability and price search when dates are provided.
    if (from && to) {
      const liveResults = await callStaysExternalApi<any[]>('/booking/search-listings', {
        method: 'POST',
        body: JSON.stringify({
          from,
          to,
          guests: guestCount,
          properties: propertyId ? [propertyId] : undefined,
          cities: cities || undefined,
          limit,
          skip,
        }),
      });

      if (Array.isArray(liveResults)) {
        const reviewIndex = await fetchStaysReviewIndex();
        const mapSearchResult = async (listing: any) => {
          const listingId = listing.id || listing.code || listing._id;
          const existing = cachedProperties.find(p =>
            p.id === listingId || p.staysListingId === listingId || p.id === listing._id || p.staysListingId === listing._id
          );
          let detail: any = null;
          // Availability search commonly returns only the cover photo. Reuse
          // a complete cached gallery when possible; otherwise fetch details.
          if (extractStaysImages(listing).length <= 1 && (existing?.images?.length || 0) <= 1) {
            detail = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(listing._id || listing.id || listing.code || listingId)}`);
          }
          const completeListing = detail ? { ...listing, ...detail } : listing;
          const property = attachStaysReviews(mapStaysListing(completeListing, existing), reviewIndex);
          const gallery = mergeStaysImageSources(detail, listing, { images: existing?.images });
          if (gallery.length > 0) property.images = gallery;
          const cacheIndex = cachedProperties.findIndex(p => p.id === property.id || p.staysListingId === property.staysListingId);
          if (cacheIndex >= 0) cachedProperties[cacheIndex] = property;
          else cachedProperties.push(property);
          const bookingPrice = Number(listing.bookingPrice?._mctotal?.BRL || 0);
          const nights = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
          const normalizedQuote = normalizeStaysQuote(listing.bookingPrice, nights);
          const perNight = Number(normalizedQuote?.dailyRate || listing.dailyRate || (bookingPrice > 0 ? bookingPrice / nights : 0));
          return {
            ...property,
            pricePerNight: perNight || property.pricePerNight || 0,
            cleaningFee: Number(listing.bookingPrice?.fees?.find((fee: any) => /clean/i.test(fee.internalName || localizedText(fee._mstitle)))?._mcval?.BRL || 0),
            calculatedPrice: {
              nights,
              dailyRate: normalizedQuote?.dailyRate ?? perNight,
              basePrice: normalizedQuote?.baseTotal ?? perNight * nights,
              cleaningFee: normalizedQuote?.cleaningFee ?? Number(listing.bookingPrice?.fees?.find((fee: any) => /clean/i.test(fee.internalName || localizedText(fee._mstitle)))?._mcval?.BRL || 0),
              serviceFee: normalizedQuote?.serviceFee ?? 0,
              totalAmount: normalizedQuote?.total ?? bookingPrice,
              currency: normalizedQuote?.currency || listing.bookingPrice?.mainCurrency || 'BRL',
              feesIncluded: normalizedQuote?.feesIncluded ?? listing.bookingPrice?.feesIncluded ?? true,
              cleaningIncluded: normalizedQuote?.cleaningIncluded ?? false,
              fees: normalizedQuote?.fees || listing.bookingPrice?.fees || [],
            },
          };
        };
        const mapped: any[] = [];
        for (let index = 0; index < liveResults.length; index += 5) {
          mapped.push(...await Promise.all(liveResults.slice(index, index + 5).map(mapSearchResult)));
        }

        return res.json({
          success: true,
          total: mapped.length,
          from,
          to,
          guests: guestCount,
          data: mapped,
          source: 'stays-live',
        });
      }

      // A dated search must never silently fall back to the local catalog:
      // the local list has no authoritative availability information.
      return res.status(503).json({
        success: false,
        code: 'availability_unavailable',
        message: 'Não foi possível confirmar a disponibilidade agora. Tente novamente.',
      });
    }

    // Filter available apartments in Stays catalog
    let results = cachedProperties.filter(p => {
      if (propertyId && p.staysPropertyId !== propertyId) return false;
      // Guest capacity
      if (p.maxGuests < guestCount) return false;

      // Destination / Resort filter
      if (destination && destination.trim() !== '') {
        const destNorm = normalize(destination);
        const matchesTitle = normalize(p.title).includes(destNorm);
        const matchesSubtitle = normalize(p.subtitle).includes(destNorm);
        const matchesDesc = normalize(p.description).includes(destNorm);
        const matchesCategory = normalize(p.category).includes(destNorm);
        const matchesComplex = normalize(p.complexName || '').includes(destNorm);
        if (!matchesTitle && !matchesSubtitle && !matchesDesc && !matchesCategory && !matchesComplex) {
          return false;
        }
      }

      return true;
    });

    // Calculate nights if dates provided
    let nights = 1;
    if (from && to) {
      const d1 = new Date(from);
      const d2 = new Date(to);
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    // Attach authoritative price calculation to each listing
    const resultsWithCalculatedPrices = results.slice(skip, skip + limit).map(p => {
      const basePrice = p.pricePerNight * nights;
      const serviceFee = Math.round(basePrice * p.serviceFeeRate);
      const cleaningFee = p.cleaningFee;
      const totalAmount = basePrice + serviceFee + cleaningFee;

      return {
        ...p,
        calculatedPrice: {
          nights,
          dailyRate: p.pricePerNight,
          basePrice,
          cleaningFee,
          serviceFee,
          totalAmount,
          currency: 'BRL',
        },
      };
    });

    return res.json({
      success: true,
      total: results.length,
      from: from || null,
      to: to || null,
      guests: guestCount,
      data: resultsWithCalculatedPrices,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 4. GET /api/accommodations/:id/calendar -> Stays /calendar/listing/:id
app.get('/api/accommodations/:id/calendar', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { from, to } = req.query;

    let property = cachedProperties.find(p => p.id === id || p.staysListingId === id);
    if (!property) {
      const liveListing = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(id)}`);
      if (liveListing) {
        property = mapStaysListing(liveListing);
        cachedProperties.push(property);
      }
    }
    if (!property) {
      return res.status(404).json({ success: false, message: 'Acomodação não encontrada.' });
    }

    const rangeStart = typeof from === 'string' ? from : new Date().toISOString().slice(0, 10);
    const rangeEnd = typeof to === 'string'
      ? to
      : new Date(new Date(rangeStart).getTime() + 89 * 86400000).toISOString().slice(0, 10);
    if (!isIsoDate(rangeStart) || !isIsoDate(rangeEnd) || rangeEnd <= rangeStart) {
      return res.status(400).json({ success: false, code: 'invalid_calendar_range', message: 'Período do calendário inválido.' });
    }
    const liveCalendar = await callStaysExternalApi<any[]>(
      `/calendar/listing/${encodeURIComponent(property.staysListingId || property.id)}?from=${encodeURIComponent(rangeStart)}&to=${encodeURIComponent(rangeEnd)}`
    );
    if (Array.isArray(liveCalendar)) {
      return res.json({
        success: true,
        listingId: property.id,
        staysListingId: property.staysListingId,
        currency: 'BRL',
        data: liveCalendar,
        source: 'stays-live',
      });
    }
    return res.status(503).json({ success: false, code: 'calendar_unavailable', message: 'Não foi possível carregar a disponibilidade atualizada.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 5. POST /api/price -> Stays /booking/calculate-price
app.post('/api/price', async (req: Request, res: Response) => {
  try {
    const { listingIds, from, to, guests, promocode } = req.body;
    const targetId = Array.isArray(listingIds) ? listingIds[0] : (listingIds || req.body.listingId);
    if (!targetId || !isIsoDate(from) || !isIsoDate(to) || stayNights(from, to) < 1) {
      return res.status(400).json({ success: false, code: 'invalid_quote_request', message: 'Informe imóvel e datas válidas para cotar.' });
    }

    let property = cachedProperties.find(p => p.id === targetId || p.staysListingId === targetId);
    if (!property) {
      const liveListing = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(targetId)}`);
      if (liveListing) property = mapStaysListing(liveListing);
    }
    if (!property) {
      return res.status(404).json({ success: false, message: 'Acomodação não encontrada para cálculo de preço.' });
    }
    const requestedGuests = Number(guests);
    if (!Number.isInteger(requestedGuests) || requestedGuests < 1 || requestedGuests > property.maxGuests) {
      return res.status(400).json({ success: false, code: 'invalid_guest_count', message: 'Quantidade de hóspedes inválida para esta acomodação.' });
    }

    const staysListingId = property.staysListingId || property.id;
    const quote = await getLiveQuote(staysListingId, from, to, requestedGuests, promocode);
    if (quote) {
      return res.json({
        success: true,
        listingId: property.id,
        staysListingId,
        ...quote,
        source: 'stays-live',
        breakdown: {
          dailyRateText: `R$ ${quote.dailyRate.toFixed(2)} x ${quote.nights} noites`,
          cleaningFeeText: quote.cleaningIncluded ? 'Taxa de limpeza incluída na diária' : 'Taxa de limpeza',
          serviceFeeText: 'Outras taxas incluídas na diária',
          totalText: `R$ ${quote.total.toFixed(2)}`,
        },
      });
    }

    // A configured PMS connection must fail closed: never show a local estimate
    // as if it were an official quote when Stays is unavailable.
    if (STAYS_CLIENT_ID && STAYS_CLIENT_SECRET) {
      return res.status(503).json({ success: false, code: 'quote_unavailable', message: 'Não foi possível obter uma cotação atual da Stays. Tente novamente.' });
    }

    const nights = stayNights(from, to);

    const dailyRate = property.pricePerNight;
    const baseTotal = dailyRate * nights;
    const cleaningFee = property.cleaningFee;
    const serviceFee = Math.round(baseTotal * property.serviceFeeRate);
    
    // Promocode support
    let discount = 0;
    if (promocode && promocode.toUpperCase() === 'CALDAS10') {
      discount = Math.round(baseTotal * 0.10);
    }

    const total = baseTotal + cleaningFee + serviceFee - discount;

    return res.json({
      success: true,
      listingId: property.id,
      staysListingId: property.staysListingId,
      nights,
      dailyRate,
      baseTotal,
      cleaningFee,
      serviceFee,
      discount,
      total,
      currency: 'BRL',
      source: 'local-fallback',
      feesIncluded: false,
      fees: [],
      cleaningIncluded: false,
      breakdown: {
        dailyRateText: `R$ ${dailyRate} x ${nights} noites`,
        cleaningFeeText: `Taxa de limpeza (higienização e rouparia)`,
        serviceFeeText: `Taxa de serviço Central de Reservas`,
        totalText: `R$ ${total}`,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/auth/sync-stays', async (req: Request, res: Response) => {
  const authentication = await authenticateVerifiedGuest(req);
  if (!authentication.guest) {
    return res.status(authentication.status || 401).json({
      success: false,
      code: authentication.code,
      message: authentication.message,
    });
  }

  const result = await syncVerifiedGuestToStays(authentication.guest);
  if (!result.ok) {
    const status = result.code === 'auth_not_configured' || result.code === 'profile_storage_unavailable' ? 503 : 502;
    return res.status(status).json({
      success: false,
      code: result.code,
      message: 'Não foi possível sincronizar seu cadastro agora. Tente novamente em instantes.',
    });
  }
  return res.json({ success: true, staysSynced: true });
});

app.get('/api/my-reservations', async (req: Request, res: Response) => {
  const authentication = await authenticateVerifiedGuest(req);
  if (!authentication.guest) {
    return res.status(authentication.status || 401).json({ success: false, code: authentication.code, message: authentication.message });
  }
  const clientId = await getLinkedStaysClientId(authentication.guest);
  if (!clientId) {
    return res.status(503).json({ success: false, code: 'guest_sync_required', message: 'Não foi possível localizar seu cadastro no sistema de reservas.' });
  }
  const response = await staysGuestRequest<any>(`/booking/clients/${encodeURIComponent(clientId)}`);
  if (!response.ok) {
    return res.status(502).json({ success: false, code: 'reservations_unavailable', message: 'Não foi possível carregar suas reservas agora.' });
  }
  const client = response.data?.client || response.data?.data || response.data;
  const reservations = clientReservations(client)
    .map(mapStaysGuestReservation)
    .filter(Boolean);
  return res.json({ success: true, data: reservations });
});

app.post('/api/my-reservations/:reservationId/cancel', async (req: Request, res: Response) => {
  const authentication = await authenticateVerifiedGuest(req);
  if (!authentication.guest) {
    return res.status(authentication.status || 401).json({ success: false, code: authentication.code, message: authentication.message });
  }
  const reservationId = String(req.params.reservationId || '').trim();
  if (!reservationId || reservationId.length > 120) {
    return res.status(400).json({ success: false, code: 'invalid_reservation_id', message: 'Identificador de reserva inválido.' });
  }
  const clientId = await getLinkedStaysClientId(authentication.guest);
  if (!clientId) {
    return res.status(503).json({ success: false, code: 'guest_sync_required', message: 'Não foi possível validar o titular desta reserva.' });
  }
  const clientResponse = await staysGuestRequest<any>(`/booking/clients/${encodeURIComponent(clientId)}`);
  if (!clientResponse.ok) {
    return res.status(502).json({ success: false, code: 'reservation_owner_check_failed', message: 'Não foi possível validar a titularidade da reserva.' });
  }
  const client = clientResponse.data?.client || clientResponse.data?.data || clientResponse.data;
  const reservation = clientReservations(client).find((item: any) =>
    [item?.id, item?._id].some((id) => String(id || '') === reservationId)
  );
  if (!reservation) {
    return res.status(404).json({ success: false, code: 'reservation_not_found', message: 'Esta reserva não foi encontrada na sua conta.' });
  }
  if (['canceled', 'cancelled'].includes(String(reservation.type || '').toLowerCase())) {
    return res.status(409).json({ success: false, code: 'already_cancelled', message: 'Esta reserva já está cancelada.' });
  }
  if (!['booked', 'reserved', 'contract'].includes(String(reservation.type || '').toLowerCase())) {
    return res.status(409).json({ success: false, code: 'reservation_not_cancellable', message: 'O status atual desta reserva não permite cancelamento por este fluxo.' });
  }

  const result = await staysGuestRequest<any>(`/booking/reservations/${encodeURIComponent(reservationId)}`, 'PATCH', {
    type: 'canceled',
    cancelMessage: 'Cancelamento solicitado pelo hóspede pelo site Central de Reservas Caldas Novas.',
  });
  if (!result.ok) {
    return res.status(502).json({ success: false, code: 'stays_cancel_failed', message: 'A Stays não confirmou o cancelamento. A reserva continua ativa; entre em contato com a Central.' });
  }
  return res.json({ success: true, reservationId });
});

// 6. POST /api/checkout -> require a verified guest and initiate Stays hosted checkout
app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    const authentication = await authenticateVerifiedGuest(req);
    if (!authentication.guest) {
      return res.status(authentication.status || 401).json({
        success: false,
        code: authentication.code,
        message: authentication.message,
      });
    }
    const guest = authentication.guest;
    const {
      listingId,
      listingIds,
      from,
      to,
      guests,
      quoteTotal,
    } = req.body;

    const targetId = listingId || (Array.isArray(listingIds) ? listingIds[0] : null);
    let property = cachedProperties.find(p => p.id === targetId || p.staysListingId === targetId);
    if (!property && targetId) {
      const liveListing = await callStaysExternalApi<any>(`/content/listings/${encodeURIComponent(targetId)}`);
      if (liveListing) property = mapStaysListing(liveListing);
    }
    const adults = Math.max(0, Number(guests?.adults ?? guests) || 0);
    const children = Math.max(0, Number(guests?.children) || 0);
    const persons = adults + children;
    if (!property || !isIsoDate(from) || !isIsoDate(to) || stayNights(from, to) < 1 || persons < 1 || persons > property.maxGuests) {
      return res.status(400).json({ success: false, code: 'invalid_checkout_request', message: 'Imóvel, datas ou quantidade de hóspedes inválidos.' });
    }
    if (!STAYS_CLIENT_ID || !STAYS_CLIENT_SECRET) {
      return res.status(503).json({ success: false, code: 'stays_not_configured', message: 'Checkout seguro indisponível no momento.' });
    }

    const availability = await checkLiveAvailability(property.staysListingId || property.id, from, to, persons);
    if (availability === null) {
      return res.status(503).json({ success: false, code: 'availability_unavailable', message: 'Não foi possível confirmar a disponibilidade atual. Nenhuma reserva foi iniciada. Tente novamente.' });
    }
    if (!availability) {
      return res.status(409).json({ success: false, code: 'dates_unavailable', message: 'Este apartamento não está mais disponível para as datas selecionadas. Escolha outro período.' });
    }

    const quote = await getLiveQuote(property.staysListingId || property.id, from, to, persons);
    if (!quote) {
      return res.status(503).json({ success: false, code: 'quote_unavailable', message: 'Não foi possível revalidar preço e disponibilidade. Tente novamente.' });
    }
    const currentQuote = {
      listingId: property.id,
      staysListingId: property.staysListingId || property.id,
      ...quote,
      source: 'stays-live',
      breakdown: {
        dailyRateText: `R$ ${quote.dailyRate.toFixed(2)} x ${quote.nights} noites`,
        cleaningFeeText: quote.cleaningIncluded ? 'Taxa de limpeza incluída na diária' : 'Taxa de limpeza',
        serviceFeeText: 'Outras taxas incluídas na diária',
        totalText: `R$ ${quote.total.toFixed(2)}`,
      },
    };
    const previousTotal = Number(quoteTotal);
    if (hasQuoteChanged(previousTotal, quote.total)) {
      return res.status(409).json({ success: false, code: 'quote_changed', message: 'O preço ou a disponibilidade mudou. Revise a cotação atualizada antes de continuar.', quote: currentQuote });
    }

    const sync = await syncVerifiedGuestToStays(guest);
    if (!sync.ok) {
      return res.status(503).json({
        success: false,
        code: sync.code || 'stays_client_sync_failed',
        message: 'Não foi possível confirmar seu cadastro com o sistema de reservas. Nenhuma reserva foi iniciada. Tente novamente.',
      });
    }

    const names = guest.fullName.split(/\s+/).filter(Boolean);
    const bookRequest = await callStaysExternalApi<any>('/book-request', {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        aptid: property.staysListingId || property.id,
        persons,
        client: {
          email: guest.email,
          fName: names[0] || '',
          lName: names.slice(1).join(' '),
        },
      }),
    });
    const redirectUrl = typeof bookRequest?.redirectUrl === 'string' ? bookRequest.redirectUrl : '';
    let redirectHost = '';
    try { redirectHost = new URL(redirectUrl).hostname.toLowerCase(); } catch { /* invalid URL */ }
    if (!redirectUrl || !/^https:\/\//i.test(redirectUrl) || !/(^|\.)stays\.(net|com\.br)$/.test(redirectHost)) {
      return res.status(502).json({ success: false, code: 'stays_checkout_failed', message: 'Não foi possível abrir o checkout. Tente novamente.' });
    }

    return res.json({
      success: true,
      status: 'checkout_pending',
      checkoutUrl: redirectUrl,
      redirectUrl,
      quote: currentQuote,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Stays Content Listings endpoint direct alias
app.get('/external/v1/content/listings', async (_req: Request, res: Response) => {
  const formatted = cachedProperties.map((p) => ({
    _id: p.id,
    code: p.staysListingId || p.id,
    _mstitle: { pt_BR: p.title },
    _msdesc: { pt_BR: p.description },
    _i_maxGuests: p.maxGuests,
    _i_rooms: p.bedrooms,
    _i_beds: p.beds,
    _f_bathrooms: p.bathrooms,
    address: {
      street: p.location.address,
      neighborhood: p.location.neighborhood,
      city: p.location.city,
      state: p.location.state,
      country: p.location.country,
    },
    latLng: {
      lat: p.location.lat,
      lng: p.location.lng,
    },
    instantBooking: p.instantBook,
    bookingPrice: p.pricePerNight,
    _t_mainImageMeta: {
      url: p.images[0],
    },
    images: p.images,
  }));
  return res.json(formatted);
});

// Stays Content Single Listing
app.get('/external/v1/content/listings/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const p = cachedProperties.find(item => item.id === id || item.staysListingId === id);
  if (!p) {
    return res.status(404).json({ error: 'Listing not found in Stays' });
  }
  return res.json({
    _id: p.id,
    code: p.staysListingId || p.id,
    _mstitle: { pt_BR: p.title },
    _msdesc: { pt_BR: p.description },
    _i_maxGuests: p.maxGuests,
    _i_rooms: p.bedrooms,
    _i_beds: p.beds,
    _f_bathrooms: p.bathrooms,
    address: {
      street: p.location.address,
      neighborhood: p.location.neighborhood,
      city: p.location.city,
      state: p.location.state,
    },
    latLng: {
      lat: p.location.lat,
      lng: p.location.lng,
    },
    instantBooking: p.instantBook,
    bookingPrice: p.pricePerNight,
    cleaningFee: p.cleaningFee,
    _t_mainImageMeta: {
      url: p.images[0],
    },
    images: p.images,
    amenities: p.amenities,
    listingAmenities: p.listingAmenities,
    propertyAmenities: p.propertyAmenities,
    sleepingArrangements: p.sleepingArrangements,
  });
});

// Stays Listing Rooms
app.get(['/api/accommodations/:id/rooms', '/external/v1/content/listing-rooms/:id'], async (req: Request, res: Response) => {
  const { id } = req.params;
  const p = cachedProperties.find(item => item.id === id || item.staysListingId === id);
  if (!p) {
    return res.status(404).json({ error: 'Rooms not found' });
  }
  return res.json(
    p.sleepingArrangements.map((room, idx) => ({
      _id: `room-${idx + 1}`,
      name: room.roomName,
      bedDescription: room.bedType,
      beds: [
        { type: room.bedType, count: 1 }
      ],
      icon: room.icon,
    }))
  );
});

// Stays Translation Listing Amenities (No apartamento)
app.get('/external/v1/translation/listing-amenities', (_req: Request, res: Response) => {
  return res.json([
    { code: 'air_conditioning', name: 'Ar-condicionado' },
    { code: 'wifi', name: 'Wi-Fi' },
    { code: 'kitchen', name: 'Cozinha' },
    { code: 'refrigerator', name: 'Geladeira' },
    { code: 'microwave', name: 'Micro-ondas' },
    { code: 'tv', name: 'TV' },
    { code: 'dishes_silverware', name: 'Louças e talheres' },
    { code: 'bed_linens', name: 'Roupa de cama e banho' },
  ]);
});

// Stays Translation Property Amenities (No condomínio)
app.get('/external/v1/translation/property-amenities', (_req: Request, res: Response) => {
  return res.json([
    { code: 'thermal_pools', name: 'Piscinas termais 24h' },
    { code: 'water_park', name: 'Parque aquático' },
    { code: 'parking', name: 'Estacionamento privativo' },
    { code: 'reception_24h', name: 'Recepção 24h' },
    { code: 'wet_bar', name: 'Bar molhado' },
    { code: 'sauna', name: 'Sauna a vapor' },
    { code: 'restaurant', name: 'Restaurante e lanchonete' },
  ]);
});

// Stays Search Listings alias
app.post('/external/v1/booking/search-listings', async (req: Request, res: Response) => {
  const { from, to, guests, limit = 20, skip = 0 } = req.body;
  const guestCount = parseInt(guests, 10) || 1;
  let nights = 1;
  if (from && to) {
    const d1 = new Date(from);
    const d2 = new Date(to);
    nights = Math.max(1, Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const results = cachedProperties.filter(p => p.maxGuests >= guestCount).slice(skip, skip + limit);
  return res.json(
    results.map(p => ({
      _id: p.id,
      code: p.staysListingId || p.id,
      _mstitle: { pt_BR: p.title },
      _msdesc: { pt_BR: p.description },
      _i_maxGuests: p.maxGuests,
      _i_rooms: p.bedrooms,
      _i_beds: p.beds,
      _f_bathrooms: p.bathrooms,
      address: {
        street: p.location.address,
        neighborhood: p.location.neighborhood,
        city: p.location.city,
        state: p.location.state,
      },
      latLng: {
        lat: p.location.lat,
        lng: p.location.lng,
      },
      instantBooking: p.instantBook,
      bookingPrice: (p.pricePerNight * nights) + p.cleaningFee + Math.round(p.pricePerNight * nights * p.serviceFeeRate),
      _t_mainImageMeta: {
        url: p.images[0],
      },
      dailyRate: p.pricePerNight,
      nights,
    }))
  );
});

// Stays Calendar direct alias
app.get('/external/v1/calendar/listing/:id', async (req: Request, res: Response) => {
  return res.status(410).json({ error: 'This local compatibility endpoint does not contain authoritative availability.' });
});

// Stays Calculate Price direct alias
app.post('/external/v1/booking/calculate-price', async (req: Request, res: Response) => {
  const { listingIds, from, to, guests } = req.body;
  const targetId = Array.isArray(listingIds) ? listingIds[0] : (listingIds || req.body.listingId);
  const property = cachedProperties.find(p => p.id === targetId || p.staysListingId === targetId);

  if (!property) {
    return res.status(404).json({ error: 'Listing not found for price calculation' });
  }

  let nights = 1;
  if (from && to) {
    const d1 = new Date(from);
    const d2 = new Date(to);
    nights = Math.max(1, Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const dailyRate = property.pricePerNight;
  const baseTotal = dailyRate * nights;
  const cleaningFee = property.cleaningFee;
  const serviceFee = Math.round(baseTotal * property.serviceFeeRate);
  const total = baseTotal + cleaningFee + serviceFee;

  return res.json({
    available: true,
    currency: 'BRL',
    nights,
    dailyRate,
    subtotal: baseTotal,
    cleaningFee,
    serviceFee,
    total,
    fees: [
      { type: 'cleaning', amount: cleaningFee, name: 'Taxa de limpeza' },
      { type: 'service', amount: serviceFee, name: 'Taxa de serviço' }
    ]
  });
});

// 7. GET /api/stays/status -> authenticated live connection test
app.get('/api/stays/status', async (_req: Request, res: Response) => {
  const configured = Boolean(STAYS_CLIENT_ID && STAYS_CLIENT_SECRET);
  if (!configured) {
    return res.status(503).json({
      connected: false,
      hasCredentials: false,
      totalProperties: cachedProperties.length,
      message: 'Credenciais Stays não configuradas no servidor.',
    });
  }
  const listings = await callStaysExternalApi<any[]>('/content/listings?limit=1&skip=0&status=active');
  if (!Array.isArray(listings)) {
    return res.status(503).json({
      connected: false,
      hasCredentials: true,
      totalProperties: cachedProperties.length,
      message: 'Falha ao autenticar ou consultar a API Stays.',
    });
  }
  return res.json({
    connected: true,
    hasCredentials: true,
    totalProperties: cachedProperties.length,
    environment: process.env.NODE_ENV || 'development',
  });
});

// 8. POST /api/sofia/chat -> Intelligent Caldas Novas Concierge
app.post('/api/sofia/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Mensagem inválida.' });
    }

    const norm = normalize(message);

    // Extract guests
    let guests = 1;
    const guestMatch = norm.match(/(\d+)\s*(pessoas|hospedes|adultos|pax)/) || norm.match(/para\s*(\d+)/);
    if (guestMatch) {
      guests = parseInt(guestMatch[1], 10) || 1;
    } else if (norm.includes('casal')) {
      guests = 2;
    } else if (norm.includes('familia')) {
      guests = 4;
    }

    // Condo detection
    let targetCondo = '';
    if (norm.includes('lacqua') || norm.includes('acqua diroma')) {
      targetCondo = 'lacqua';
    } else if (norm.includes('exclusive')) {
      targetCondo = 'exclusive';
    } else if (norm.includes('piazza')) {
      targetCondo = 'piazza';
    } else if (norm.includes('bandeirante')) {
      targetCondo = 'bandeirante';
    } else if (norm.includes('nautico') || norm.includes('enseada')) {
      targetCondo = 'nautico';
    } else if (norm.includes('ilhas do lago')) {
      targetCondo = 'ilhas';
    } else if (norm.includes('golden')) {
      targetCondo = 'golden';
    }

    // Special intent flags
    const wantsDrinksOrCooler = norm.includes('bebida') || norm.includes('cooler') || norm.includes('copo termico') || norm.includes('cerveja');
    const wantsTicketsIncluded = norm.includes('ingresso') || norm.includes('parque gratis') || norm.includes('acqua park');
    const wantsLakeOrBoats = norm.includes('lago') || norm.includes('nautico') || norm.includes('lancha');

    // Filter properties matching criteria
    let matched = cachedProperties.filter(p => {
      if (guests > 1 && p.maxGuests < guests) return false;
      if (targetCondo && !normalize(p.title).includes(targetCondo) && !normalize(p.category).includes(targetCondo) && !normalize(p.subtitle).includes(targetCondo)) {
        return false;
      }
      return true;
    });

    // If too restrictive, widen but sort by relevance
    if (matched.length === 0) {
      matched = cachedProperties.filter(p => {
        if (targetCondo) {
          return normalize(p.title).includes(targetCondo) || normalize(p.subtitle).includes(targetCondo);
        }
        return p.maxGuests >= guests;
      });
    }

    let reply = '';
    let suggestedFilters: any = {};

    if (wantsDrinksOrCooler && (targetCondo === 'lacqua' || !targetCondo)) {
      reply = `Perfeito! No **L’acqua diRoma (Jardins Acqua Park)** você **pode sim descer com seu cooler / caixa térmica e copos térmicos** para as áreas de solário e quiosques das piscinas termais! 🍻\n\nA única regra do condomínio para segurança dos banhistas é **não utilizar recipientes de vidro** na área das piscinas (apenas latas, plásticos e copos térmicos). Além disso, o parque termal conta com piscina de ondas e funciona **24 horas ininterruptas**!\n\nEncontrei as melhores opções no nosso catálogo oficial com capacidade para ${guests >= 2 ? `${guests} pessoas` : 'sua estadia'}:`;
      suggestedFilters = { destination: "L'acqua diRoma", guests: guests > 1 ? guests : 5 };
    } else if (wantsTicketsIncluded || targetCondo === 'exclusive' || targetCondo === 'piazza') {
      reply = `Ótima escolha! Para quem busca **ingressos inclusos**, os apartamentos no complexo **diRoma Exclusive** e **Piazza diRoma** dão acesso diário sem fila ao famoso **diRoma Acqua Park & Splash** para todos os hóspedes da reserva! 🌊\n\nConfira as opções disponíveis no nosso catálogo:`;
      suggestedFilters = { destination: "diRoma Exclusive", guests };
    } else if (wantsLakeOrBoats || targetCondo === 'nautico' || targetCondo === 'ilhas') {
      reply = `Excelente pedida! Às margens do deslumbrante **Lago Corumbá**, o **Enseada Náutico** e o **Ilhas do Lago** oferecem marina para lanchas/jet-ski, piscinas termais de borda infinita com vista para a represa e pier privativo! 🚤\n\nAqui estão as acomodações disponíveis:`;
      suggestedFilters = { destination: "Náutico", guests };
    } else if (targetCondo === 'bandeirante') {
      reply = `O **Thermas do Bandeirante** é ideal para quem quer ficar **no coração do centro turístico de Caldas Novas**, perto da Feira do Luar, restaurantes e praças, com parque termal com águas quentes 24h! ♨️\n\nAqui estão as unidades disponíveis:`;
      suggestedFilters = { destination: "Thermas do Bandeirante", guests };
    } else {
      reply = `Olá! Sou a Sofia, Concierge da Central de Reservas Caldas Novas. Analisei sua solicitação para ${guests > 1 ? `${guests} hóspedes` : 'sua viagem'}${targetCondo ? ` no condomínio ${targetCondo.toUpperCase()}` : ''} e selecionei os melhores apartamentos do nosso catálogo, com águas termais e estrutura completa! 🏊‍♂️`;
      suggestedFilters = { destination: targetCondo || 'Caldas Novas', guests };
    }

    return res.json({
      success: true,
      reply,
      matchedProperties: matched.slice(0, 4),
      suggestedFilters,
      totalFound: matched.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Vite middleware for dev or static serve for production
async function startServer() {
  if (SERVE_DIST) {
    app.use(express.static(path.resolve('dist')));
    app.get('/{*path}', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRCN Stays.net backend server running on http://0.0.0.0:${PORT}`);
  });
  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a free port.`);
      process.exit(1);
    }
    console.error('Could not start the backend server:', error.message);
    process.exit(1);
  });
}

startServer();
