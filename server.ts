import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { STAYS_NET_APARTMENTS } from './src/data/staysApartments';
import { Property } from './src/types';
import { hasQuoteChanged, normalizeStaysQuote } from './src/utils/staysPricing';
import { extractStaysImages, mergeStaysImageSources } from './src/utils/staysImages';

// Node 20+ natively loads the local environment file before configuration is read.
try {
  process.loadEnvFile('.env');
} catch {
  // Keep defaults when running without a local .env file.
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Configuration from environment
const STAYS_BASE_URL = process.env.STAYS_BASE_URL || 'https://crcn.stays.net/external/v1';
const STAYS_CLIENT_ID = process.env.STAYS_CLIENT_ID || '';
const STAYS_CLIENT_SECRET = process.env.STAYS_CLIENT_SECRET || '';

app.use(cors());
app.use(express.json());

// In-memory cache for live Stays PMS synchronized properties
let cachedProperties: Property[] = [...STAYS_NET_APARTMENTS];

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

  return {
    ...(existing || {}),
    id: shortId,
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
    rating: existing?.rating || 0,
    reviewCount: existing?.reviewCount || 0,
    isSuperhost: existing?.isSuperhost || false,
    isGuestFavorite: existing?.isGuestFavorite || false,
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
    reviews: existing?.reviews || [],
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

// 1. GET /api/accommodations -> Stays /content/listings
app.get('/api/accommodations', async (_req: Request, res: Response) => {
  try {
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
      cachedProperties = mapped;
      return res.json({ success: true, source: 'stays-live', count: mapped.length, data: mapped });
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
    const { from, to, guests, destination, cities, limit = 20, skip = 0 } = req.body;
    const guestCount = parseInt(guests, 10) || 1;

    // Prefer the authoritative Stays availability and price search when dates are provided.
    if (from && to) {
      const liveResults = await callStaysExternalApi<any[]>('/booking/search-listings', {
        method: 'POST',
        body: JSON.stringify({
          from,
          to,
          guests: guestCount,
          cities: cities || (destination ? [destination] : undefined),
          limit,
          skip,
        }),
      });

      if (Array.isArray(liveResults)) {
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
          const property = mapStaysListing(completeListing, existing);
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
      // Guest capacity
      if (p.maxGuests < guestCount) return false;

      // Destination / Resort filter
      if (destination && destination.trim() !== '') {
        const destNorm = normalize(destination);
        const matchesTitle = normalize(p.title).includes(destNorm);
        const matchesSubtitle = normalize(p.subtitle).includes(destNorm);
        const matchesDesc = normalize(p.description).includes(destNorm);
        const matchesCategory = normalize(p.category).includes(destNorm);
        if (!matchesTitle && !matchesSubtitle && !matchesDesc && !matchesCategory) {
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

// 6. POST /api/checkout -> revalidate quote and initiate Stays hosted checkout
app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    const {
      listingId,
      listingIds,
      from,
      to,
      guests,
      guestName,
      guestEmail,
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
    if (String(guestName || '').trim().split(/\s+/).filter(Boolean).length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guestEmail || '').trim())) {
      return res.status(400).json({ success: false, code: 'invalid_guest', message: 'Informe nome completo e e-mail válido do hóspede titular.' });
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

    const names = String(guestName || '').trim().split(/\s+/).filter(Boolean);
    const bookRequest = await callStaysExternalApi<any>('/book-request', {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        aptid: property.staysListingId || property.id,
        persons,
        client: {
          email: String(guestEmail || '').trim(),
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
  if (process.env.NODE_ENV === 'production') {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRCN Stays.net backend server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
