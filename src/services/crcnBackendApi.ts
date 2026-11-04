import {
  readAccommodationCatalogCache,
  writeAccommodationCatalogCache,
  updateAccommodationCatalogCache,
} from '../utils/accommodationCatalogCache';
import type { Property, Reservation, ReservationCancellationResult } from '../types';
import type { StaysCalendarDay } from '../utils/staysAvailability';
import {
  isCalculatedPriceResponse,
  isFiniteNumber,
  isIsoDate,
  isProperty,
  isRecord,
  isReservation,
  isOwnerAccessRequest,
  isOwnerAccessStatus,
  isStaysOwnerSummary,
  isStaysCalendarDay,
  isDirectBookingOrderListItem,
  isDirectBookingCancellationReceipt,
  isDirectBookingOperationsOrder,
  isDirectBookingOperationsWebhook,
} from '../utils/apiValidation';
import { isOwnerDashboardData } from '../utils/ownerDashboardValidation';
import type {
  DirectBookingCancellationReceipt,
  DirectBookingOrderListItem,
  DirectBookingOrderSummary,
} from './checkoutApi';
import { isSafeMediaUrl, sanitizePropertyMedia } from '../utils/propertyMedia';
import { matchesPropertyDestination } from '../utils/propertySearchFilters';
import { apiFetch } from './apiFetch';
import { getConfirmedPropertyQuote } from '../utils/propertyDisplayPrice';

import { scheduleAccommodationSearch } from './accommodationSearchQueue';
import type { ScheduledRequestOptions } from './requestScheduler';

const API_REQUEST_TIMEOUT_MS = 20_000;
const STAYS_SEARCH_PAGE_SIZE = 20;

async function withApiRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const timeoutId = globalThis.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    controller.signal.throwIfAborted();
    return await request(controller.signal);
  } finally {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abort);
  }
}

export interface SearchAccommodationsParams {
  purpose?: 'search' | 'discovery';
  from?: string;
  to?: string;
  guests?: number;
  destination?: string;
  propertyId?: string;
  cities?: string[];
  limit?: number;
  skip?: number;
}

export interface AccommodationSearchPage {
  /** Remaining server validity on the browser clock; cache reads never renew it. */
  expiresAt?: number;
  /** Number of usable results in this page, never a global result count. */
  total: number;
  data: Property[];
  unquotedCount: number;
  pagination: {
    receivedCount: number;
    nextSkip: number;
    hasMore: boolean;
  };
}

export interface CalculatedPriceResponse {
  expiresAt?: number;
  success: boolean;
  listingId: string;
  staysListingId?: string;
  nights: number;
  dailyRate: number;
  baseTotal: number;
  cleaningFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  currency: string;
  feesIncluded?: boolean;
  cleaningIncluded?: boolean;
  fees?: Array<{
    _id?: string;
    internalName?: string;
    _mstitle?: Record<string, string>;
    _mcval?: Record<string, number>;
  }>;
  source?: string;
  breakdown: {
    dailyRateText: string;
    cleaningFeeText: string;
    serviceFeeText: string;
    totalText: string;
  };
}

export interface StaysStatusResponse {
  connected: boolean;
  hasCredentials: boolean;
  totalProperties: number;
  environment?: string;
  message?: string;
}

export interface StaysCheckoutReadinessResponse {
  ready: boolean;
  code: string | null;
  message: string;
}

export type StaysCheckoutStartResponse =
  { success: true; checkoutUrl: string } | { success: false; code: string; message: string };

export interface SofiaChatResponse {
  success: boolean;
  reply: string;
  matchedProperties: Property[];
  suggestedFilters?: { destination?: string; guests?: number; from?: string; to?: string };
  totalFound?: number;
  assistant?: 'openai' | 'catalog';
}

const isSuggestedFilters = (
  value: unknown,
): value is NonNullable<SofiaChatResponse['suggestedFilters']> =>
  isRecord(value) &&
  (value.destination === undefined || typeof value.destination === 'string') &&
  (value.guests === undefined ||
    (isFiniteNumber(value.guests) && Number.isInteger(value.guests) && value.guests >= 1)) &&
  (value.from === undefined || isIsoDate(value.from)) &&
  (value.to === undefined || isIsoDate(value.to)) &&
  (value.from === undefined || value.to === undefined || value.to > value.from);

export type OwnerAccessStatus = 'none' | 'pending' | 'approved' | 'suspended' | 'rejected';

export interface OwnerAccessRequest {
  userId: string;
  fullName: string;
  email: string;
  requestedAt: string;
}

export interface DirectBookingOperationsOrder {
  id: string;
  publicReference: string;
  status: DirectBookingOrderSummary['status'];
  listingId: string;
  from: string;
  to: string;
  guestName: string;
  guestEmail: string;
  quoteTotal: string;
  currency: 'BRL';
  paymentStatus: string | null;
  paymentMethod: string | null;
  gatewayPaymentId: string | null;
  staysReservationId: string | null;
  hasResumeToken?: boolean;
  resumeTokenExpiresAt?: string | null;
  resumeTokenRevocation?: {
    reviewedBy: string | null;
    at: string | null;
  } | null;
  paymentApprovedWithoutConfirmedReservation: boolean;
  latePaymentAfterHold: boolean;
  staysActionFailed: boolean;
  confirmationEmail: {
    status: 'pending' | 'queued' | 'processing' | 'sent' | 'failed' | 'skipped';
    attempts: number;
    lastAttemptAt: string | null;
    queuedAt: string | null;
    nextAttemptAt: string | null;
    sentAt: string | null;
  } | null;
  staysCancellationConfirmed: boolean;
  gatewayRefundConfirmed: boolean;
  manualCancellationReview: {
    reason: string | null;
    reviewedBy: string | null;
    at: string | null;
  } | null;
  manualGatewayRefundReview: {
    reviewedBy: string | null;
    at: string | null;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastEvent: {
    event?: string;
    status?: string;
    source?: string;
    code?: string;
    at?: string;
    previous_gateway_status?: string;
    gateway_status?: string;
    gateway_updated_at?: string;
  } | null;
  issue: {
    source: 'stays' | 'payment' | 'webhook' | string;
    action: string | null;
    status: string;
    code: string | null;
    message: string | null;
  } | null;
}

export interface DirectBookingOperationsPage {
  orders: DirectBookingOperationsOrder[];
  unmatchedWebhooks: DirectBookingOperationsWebhook[];
  unmatchedWebhookTotal: number;
  unmatchedWebhookCurrentPage: number;
  unmatchedWebhookLastPage: number;
  currentPage: number;
  lastPage: number;
  total: number;
}

export interface DirectBookingOperationsWebhook {
  id: string;
  gatewayPaymentId: string;
  status: 'received' | 'retrying' | 'failed' | 'queued' | 'processing';
  errorCode: string | null;
  attempts: number;
  canRetry: boolean;
  receivedAt: string | null;
  updatedAt: string | null;
}

export interface StaysOwnerSummary {
  id: string;
  name: string;
  propertyCount?: number;
}

export interface OwnerDashboardData {
  period: { from: string; to: string };
  ownerName: string;
  totals: { debit: number; credit: number };
  properties: Array<{
    staysListingId: string;
    title: string;
    image: string;
    debit: number;
    credit: number;
  }>;
  reservations: Array<{
    id: string;
    code: string;
    listingId: string;
    propertyTitle: string;
    propertyImage: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    status: 'confirmed' | 'cancelled' | 'blocked' | 'other';
    paymentStatus: 'paid' | 'partial' | 'unpaid' | 'unknown';
    total: number;
    currency: string;
    nights: number;
  }>;
  entries: Array<{
    id: string;
    date: string;
    listingId: string;
    propertyTitle: string;
    reservationId: string | null;
    reservationCode: string | null;
    description: string;
    publicNote: string | null;
    type: 'debit' | 'credit';
    status: string;
    amount: number;
  }>;
}

export interface OwnerAccountingDetails {
  reservationCode: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  fees: Array<{ label: string; amount: number }>;
  payout: number;
  ledgerEntry: {
    date: string;
    type: 'debit' | 'credit';
    status: string;
    description: string;
    amount: number;
  };
}

const calendarExpirations = new WeakMap<StaysCalendarDay[], number>();
export const getCalendarExpiration = (days: StaysCalendarDay[]): number | undefined =>
  calendarExpirations.get(days);

class CrcnBackendApiService {
  private getCachedResorts(): Array<{ id: string; name: string }> {
    try {
      const cached = readAccommodationCatalogCache();
      const byId = new Map<string, string>();
      for (const property of cached) {
        if (property.staysPropertyId && property.complexName?.trim()) {
          byId.set(property.staysPropertyId, property.complexName.trim());
        }
      }
      return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR'),
      );
    } catch {
      return [];
    }
  }

  public async getResorts(): Promise<Array<{ id: string; name: string }>> {
    try {
      const res = await apiFetch('/api/resorts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('O servidor respondeu com conteúdo diferente de JSON.');
      }
      const json: unknown = await res.json();
      const resorts =
        isRecord(json) && Array.isArray(json.data)
          ? json.data.filter(
              (item): item is { id: string; name: string } =>
                isRecord(item) &&
                typeof item.id === 'string' &&
                item.id.trim() !== '' &&
                typeof item.name === 'string' &&
                item.name.trim() !== '',
            )
          : [];
      if (resorts.length > 0) return resorts;
      if (isRecord(json) && Array.isArray(json.data) && json.data.length > 0) {
        throw new Error('A lista de resorts contém dados inválidos.');
      }
      return this.getCachedResorts();
    } catch (err) {
      console.warn('Could not load live resorts; using synchronized cache when available:', err);
      return this.getCachedResorts();
    }
  }

  // 1. GET /api/accommodations
  public async getAccommodations(): Promise<Property[]> {
    const json: unknown = await withApiRequestTimeout(async (signal) => {
      const res = await apiFetch('/api/accommodations', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    if (
      !isRecord(json) ||
      (json.source !== 'stays-live' && json.source !== 'stays-simulated') ||
      !Array.isArray(json.data) ||
      !json.data.every(isProperty)
    ) {
      throw new Error('O catálogo retornou dados inválidos.');
    }
    const accommodations: Property[] = json.data.map(sanitizePropertyMedia);
    writeAccommodationCatalogCache(accommodations, json.source);
    return accommodations;
  }

  // 2. GET /api/accommodations/:id
  public async getAccommodationById(id: string): Promise<Property | null> {
    try {
      const json: unknown = await withApiRequestTimeout(async (signal) => {
        const res = await apiFetch(`/api/accommodations/${encodeURIComponent(id)}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      if (!isRecord(json) || (json.data !== null && !isProperty(json.data))) {
        throw new Error('A acomodação retornou dados inválidos.');
      }
      const property = json.data ? sanitizePropertyMedia(json.data) : null;
      if (property) updateAccommodationCatalogCache(property);
      return property;
    } catch (err) {
      console.warn(`Falling back to local cache for accommodation ${id}:`, err);
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      return STAYS_NET_APARTMENTS.find((p) => p.id === id || p.staysListingId === id) || null;
    }
  }

  /** Fetch one raw page without filling gaps or requesting subsequent pages. */
  public async searchAccommodationsPage(
    params: SearchAccommodationsParams,
    options: ScheduledRequestOptions = {},
  ): Promise<AccommodationSearchPage> {
    const limit = params.limit ?? 12;
    const skip = params.skip ?? 0;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > STAYS_SEARCH_PAGE_SIZE ||
      !Number.isSafeInteger(skip) ||
      skip < 0
    ) {
      throw new Error('A paginação solicitada é inválida.');
    }
    return scheduleAccommodationSearch(
      { ...params, limit, skip },
      (signal) => this.fetchAccommodationSearchPage({ ...params, limit, skip }, signal),
      options,
    );
  }

  private async fetchAccommodationSearchPage(
    params: SearchAccommodationsParams & { limit: number; skip: number },
    requestSignal: AbortSignal,
    retryExpiredSnapshot = true,
  ): Promise<AccommodationSearchPage> {
    const { limit, skip } = params;
    const startedAt = performance.now();
    const { json, serverTime } = await withApiRequestTimeout(async (signal) => {
      const res = await apiFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, limit, skip }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        json: (await res.json()) as unknown,
        serverTime: Date.parse(res.headers.get('Date') || ''),
      };
    }, requestSignal);
    if (
      !isRecord(json) ||
      !isFiniteNumber(json.total) ||
      !Number.isInteger(json.total) ||
      json.total < 0 ||
      !Array.isArray(json.data) ||
      json.data.length > limit ||
      !json.data.every(isProperty) ||
      (params.from &&
        params.to &&
        ((json.source !== 'stays-live' && json.source !== 'stays-simulated') ||
          json.from !== params.from ||
          json.to !== params.to ||
          json.guests !== (params.guests ?? 1)))
    ) {
      throw new Error('A pesquisa retornou uma resposta inválida.');
    }
    const pageUnquoted = json.unquotedCount ?? 0;
    if (!Number.isSafeInteger(pageUnquoted) || !isFiniteNumber(pageUnquoted) || pageUnquoted < 0) {
      throw new Error('A pesquisa retornou uma contagem de cotações inválida.');
    }
    const pagination = json.pagination;
    if (
      pagination !== undefined &&
      (!isRecord(pagination) ||
        !isFiniteNumber(pagination.receivedCount) ||
        !Number.isSafeInteger(pagination.receivedCount) ||
        pagination.receivedCount < json.data.length ||
        pagination.receivedCount > limit ||
        !Number.isSafeInteger(pagination.nextSkip) ||
        pagination.nextSkip !== skip + pagination.receivedCount ||
        typeof pagination.hasMore !== 'boolean' ||
        (pagination.hasMore && pagination.receivedCount === 0))
    ) {
      throw new Error('A paginação da pesquisa retornou dados inválidos.');
    }
    let expiresAt: number | undefined;
    if (json.meta !== undefined) {
      if (
        !isRecord(json.meta) ||
        typeof json.meta.fetchedAt !== 'string' ||
        typeof json.meta.expiresAt !== 'string'
      ) {
        throw new Error('A pesquisa retornou uma validade inválida.');
      }
      const fetchedAt = Date.parse(json.meta.fetchedAt);
      const serverExpiresAt = Date.parse(json.meta.expiresAt);
      expiresAt = serverExpiresAt;
      if (
        !Number.isFinite(fetchedAt) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= fetchedAt ||
        expiresAt - fetchedAt > 60_000 ||
        fetchedAt > (Number.isFinite(serverTime) ? serverTime + 1000 : Date.now() + 60_000)
      ) {
        throw new Error('A cotação da pesquisa expirou. Tente novamente.');
      }
      if (Number.isFinite(serverTime)) {
        // Convert remaining server validity to the device clock, allowing for
        // HTTP Date precision and the entire round trip without extending it.
        const remaining = Math.min(
          expiresAt - fetchedAt,
          expiresAt - serverTime - 1000 - Math.max(0, performance.now() - startedAt),
        );
        expiresAt = Date.now() + remaining;
      }
      if (expiresAt <= Date.now()) {
        if (retryExpiredSnapshot && Number.isFinite(serverTime)) {
          // A snapshot can expire in transit or just before an explicit refresh.
          // Give the shared cache a bounded chance to expire, then retry once.
          requestSignal.throwIfAborted();
          const delay = Math.min(2000, Math.max(0, serverExpiresAt - serverTime));
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              globalThis.clearTimeout(timer);
              reject(requestSignal.reason);
            };
            const timer = globalThis.setTimeout(() => {
              requestSignal.removeEventListener('abort', abort);
              resolve();
            }, delay);
            requestSignal.addEventListener('abort', abort, { once: true });
          });
          return this.fetchAccommodationSearchPage(params, requestSignal, false);
        }
        throw new Error('A cotação da pesquisa expirou. Tente novamente.');
      }
    }
    const requestedNights =
      params.from && params.to
        ? Math.round(
            (Date.parse(`${params.to}T00:00:00Z`) - Date.parse(`${params.from}T00:00:00Z`)) /
              86_400_000,
          )
        : null;
    const quoteDeadline =
      requestedNights === null ? undefined : Math.min(expiresAt ?? Infinity, Date.now() + 45_000);
    let unquotedCount = pageUnquoted;
    const properties = new Map<string, Property>();
    for (const item of json.data) {
      const property = sanitizePropertyMedia(item);
      const quote = getConfirmedPropertyQuote(property);
      if (requestedNights !== null && (!quote || quote.nights !== requestedNights)) {
        unquotedCount += 1;
        continue;
      }
      properties.set(
        property.id,
        quote && quoteDeadline !== undefined
          ? {
              ...property,
              calculatedPrice: {
                ...quote,
                expiresAt: Math.min(quote.expiresAt ?? Infinity, quoteDeadline),
              },
            }
          : property,
      );
    }
    if (quoteDeadline !== undefined && quoteDeadline <= Date.now())
      throw new Error('A cotação da pesquisa expirou. Tente novamente.');
    const data = [...properties.values()];
    return {
      ...(expiresAt === undefined ? {} : { expiresAt }),
      total: data.length,
      data,
      unquotedCount,
      pagination: isRecord(pagination)
        ? {
            receivedCount: Number(pagination.receivedCount),
            nextSkip: Number(pagination.nextSkip),
            hasMore: Boolean(pagination.hasMore),
          }
        : {
            receivedCount: json.data.length,
            nextSkip: skip + json.data.length,
            hasMore: json.data.length === limit,
          },
    };
  }

  // 3. POST /api/search
  public async searchAccommodations(
    params: SearchAccommodationsParams,
    options: ScheduledRequestOptions = {},
  ): Promise<{
    total: number;
    data: Property[];
    unquotedCount?: number;
  }> {
    try {
      const initialSkip = Math.max(0, Math.trunc(params.skip ?? 0));
      const requestedResultCount =
        params.limit === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, Math.trunc(params.limit));
      const propertiesById = new Map<string, Property>();
      let pageOffset = initialSkip;
      let unquotedCount = 0;

      while (propertiesById.size < requestedResultCount) {
        const pageLimit = Math.min(
          STAYS_SEARCH_PAGE_SIZE,
          requestedResultCount - propertiesById.size,
        );
        options.signal?.throwIfAborted();
        const page = await this.searchAccommodationsPage(
          {
            ...params,
            limit: pageLimit,
            skip: pageOffset,
          },
          { ...options, priority: options.priority ?? 'visible' },
        );
        unquotedCount += page.unquotedCount;
        let addedProperties = 0;
        for (const property of page.data) {
          if (!propertiesById.has(property.id)) {
            propertiesById.set(property.id, property);
            addedProperties += 1;
          }
        }
        pageOffset = page.pagination.nextSkip;
        if (!page.pagination.hasMore) break;
        if (page.data.length > 0 && addedProperties === 0 && page.unquotedCount === 0) {
          throw new Error('A paginação da pesquisa retornou anúncios repetidos.');
        }
      }

      const data = [...propertiesById.values()];
      if (params.from && params.to && data.length === 0 && unquotedCount > 0) {
        throw new Error('Não foi possível confirmar os preços para esse período.');
      }
      return { total: data.length, data, ...(unquotedCount > 0 ? { unquotedCount } : {}) };
    } catch (err) {
      if (options.signal?.aborted) throw err;
      console.warn('Accommodation search failed:', err);
      if (params.from && params.to) {
        // A static catalog cannot confirm availability or provide a date-specific quote.
        // Let the caller show an availability error and offer a retry instead of implying no stays exist.
        throw err;
      }
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      let filtered = STAYS_NET_APARTMENTS;
      if (params.guests && params.guests > 1) {
        filtered = filtered.filter((p) => p.maxGuests >= (params.guests || 1));
      }
      if (params.destination) {
        filtered = filtered.filter((property) =>
          matchesPropertyDestination(property, params.destination || ''),
        );
      }
      if (params.propertyId) {
        filtered = filtered.filter((p) => p.staysPropertyId === params.propertyId);
      }
      if (params.cities?.length) {
        const cities = new Set(params.cities.map((city) => city.toLocaleLowerCase('pt-BR')));
        filtered = filtered.filter((p) => cities.has(p.location.city.toLocaleLowerCase('pt-BR')));
      }
      const total = filtered.length;
      const skip = Math.max(0, Math.trunc(params.skip ?? 0));
      const limit = params.limit === undefined ? undefined : Math.max(0, Math.trunc(params.limit));
      return { total, data: filtered.slice(skip, limit === undefined ? undefined : skip + limit) };
    }
  }

  // 4. GET /api/accommodations/:id/calendar
  public async getAccommodationCalendar(
    id: string,
    from?: string,
    to?: string,
  ): Promise<StaysCalendarDay[]> {
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const requestStartedAt = Date.now();
      const { json, serverTime } = await withApiRequestTimeout(async (signal) => {
        const res = await apiFetch(
          `/api/accommodations/${encodeURIComponent(id)}/calendar?${query.toString()}`,
          { signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return {
          json: (await res.json()) as unknown,
          serverTime: Date.parse(res.headers.get('Date') || ''),
        };
      });
      if (!isRecord(json) || !Array.isArray(json.data) || !json.data.every(isStaysCalendarDay)) {
        return [];
      }
      if (isRecord(json.meta) && typeof json.meta.expiresAt === 'string') {
        const expiration = Date.parse(json.meta.expiresAt);
        if (Number.isFinite(expiration)) {
          // HTTP Date has second precision. Keep the remaining server lifetime,
          // conservatively allowing for rounding and the entire request duration.
          // Comparing absolute server time with a phone clock rejects fresh data
          // on fast clocks and keeps stale data available on slow clocks.
          const localExpiration = Number.isFinite(serverTime)
            ? requestStartedAt + expiration - serverTime - 1000
            : expiration;
          calendarExpirations.set(json.data, localExpiration);
        }
      }
      return json.data;
    } catch (err) {
      console.warn('Falling back for calendar:', err);
      return [];
    }
  }

  // 5. POST /api/price
  public async calculatePrice(payload: {
    listingId: string;
    from: string;
    to: string;
    guests?: number;
    promocode?: string;
  }): Promise<CalculatedPriceResponse | null> {
    try {
      const json: unknown = await withApiRequestTimeout(async (signal) => {
        const res = await apiFetch('/api/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingIds: [payload.listingId],
            from: payload.from,
            to: payload.to,
            guests: payload.guests || 2,
            promocode: payload.promocode,
          }),
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      if (!isCalculatedPriceResponse(json)) {
        throw new Error('A resposta de preço retornou dados inválidos.');
      }

      const requestedCheckIn = isIsoDate(payload.from)
        ? Date.parse(`${payload.from}T00:00:00.000Z`)
        : Number.NaN;
      const requestedCheckOut = isIsoDate(payload.to)
        ? Date.parse(`${payload.to}T00:00:00.000Z`)
        : Number.NaN;
      const requestedNights = (requestedCheckOut - requestedCheckIn) / 86400000;
      const matchesRequestedListing =
        json.listingId === payload.listingId || json.staysListingId === payload.listingId;

      if (
        !matchesRequestedListing ||
        !Number.isInteger(requestedNights) ||
        requestedNights < 1 ||
        json.nights !== requestedNights ||
        json.currency !== 'BRL'
      ) {
        throw new Error('A cotação não corresponde ao imóvel, período ou moeda solicitados.');
      }

      return json;
    } catch (err) {
      console.warn('Error calculating price on backend:', err);
      return null;
    }
  }

  public async getStaysCheckoutReadiness(): Promise<StaysCheckoutReadinessResponse | null> {
    try {
      const response = await apiFetch('/api/stays-checkout/readiness', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const json: unknown = await response.json();
      if (
        !response.ok ||
        !isRecord(json) ||
        typeof json.ready !== 'boolean' ||
        (json.code !== null && typeof json.code !== 'string') ||
        typeof json.message !== 'string'
      ) {
        return null;
      }
      return { ready: json.ready, code: json.code, message: json.message };
    } catch {
      return null;
    }
  }

  public async startStaysCheckout(payload: {
    listingId: string;
    from: string;
    to: string;
    guests: number;
    quoteTotal: number;
    guest: { fullName: string; email: string };
  }): Promise<StaysCheckoutStartResponse | null> {
    try {
      const response = await apiFetch('/api/stays-checkout', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json: unknown = await response.json();
      if (!isRecord(json) || typeof json.success !== 'boolean') return null;
      if (json.success === true) {
        return typeof json.checkoutUrl === 'string'
          ? { success: true, checkoutUrl: json.checkoutUrl }
          : null;
      }
      return typeof json.code === 'string' && typeof json.message === 'string'
        ? { success: false, code: json.code, message: json.message }
        : null;
    } catch {
      return null;
    }
  }

  public async syncStaysGuest(
    accessToken: string,
  ): Promise<{ success: boolean; message?: string } | null> {
    try {
      const res = await apiFetch('/api/auth/sync-stays', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      if (
        !isRecord(json) ||
        typeof json.success !== 'boolean' ||
        (json.message !== undefined && typeof json.message !== 'string') ||
        (json.success && json.staysSynced !== true)
      )
        return null;
      return {
        success: json.success,
        ...(typeof json.message === 'string' ? { message: json.message } : {}),
      };
    } catch (err) {
      console.warn('Error syncing authenticated guest:', err);
      return null;
    }
  }

  public async getMyReservations(accessToken: string): Promise<Reservation[]> {
    const res = await apiFetch('/api/my-reservations', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar suas reservas.',
      );
    }
    if (!Array.isArray(json.data) || !json.data.every(isReservation)) {
      throw new Error('A API retornou dados inválidos para reservas.');
    }
    return json.data.map((reservation) => ({
      ...reservation,
      propertyImage: isSafeMediaUrl(reservation.propertyImage) ? reservation.propertyImage : '',
    }));
  }

  public async getMyDirectBookingOrders(
    accessToken: string,
  ): Promise<DirectBookingOrderListItem[]> {
    const res = await apiFetch('/api/my-direct-booking-orders', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar suas compras no site.',
      );
    }
    if (!Array.isArray(json.data) || !json.data.every(isDirectBookingOrderListItem)) {
      throw new Error('A API retornou dados inválidos para as compras no site.');
    }
    return json.data;
  }

  public async requestDirectBookingCancellation(
    accessToken: string,
    publicReference: string,
  ): Promise<{
    cancellationReceipt: DirectBookingCancellationReceipt;
    alreadyRequested: boolean;
    message: string;
  }> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await apiFetch(
      `/api/my-direct-booking-orders/${encodeURIComponent(publicReference)}/cancel`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.cancellationStatus !== 'requested' ||
      typeof json.message !== 'string' ||
      typeof json.alreadyRequested !== 'boolean' ||
      !isDirectBookingCancellationReceipt(json.cancellationReceipt) ||
      json.cancellationReceipt.protocol !== `CANCEL-${publicReference}`
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível registrar a solicitação de cancelamento.',
      );
    }

    return {
      cancellationReceipt: json.cancellationReceipt,
      alreadyRequested: json.alreadyRequested,
      message: json.message,
    };
  }

  public async cancelMyReservation(
    reservationId: string,
    accessToken: string,
  ): Promise<ReservationCancellationResult> {
    const res = await apiFetch(`/api/my-reservations/${encodeURIComponent(reservationId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.reservationId !== reservationId ||
      (json.cancellationStatus !== undefined &&
        json.cancellationStatus !== 'cancelled' &&
        json.cancellationStatus !== 'requested')
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível cancelar esta reserva.',
      );
    }

    return json.cancellationStatus === 'requested' ? 'requested' : 'cancelled';
  }

  public async getOwnerAccess(accessToken: string): Promise<OwnerAccessStatus> {
    const res = await apiFetch('/api/owner/access', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível verificar o acesso de proprietário.',
      );
    }
    if (!isOwnerAccessStatus(json.status))
      throw new Error('A API retornou um status inválido de acesso de proprietário.');
    return json.status;
  }

  public async requestOwnerAccess(accessToken: string): Promise<OwnerAccessStatus> {
    const res = await apiFetch('/api/owner/access/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível solicitar acesso ao painel.',
      );
    }
    if (!isOwnerAccessStatus(json.status))
      throw new Error('A API retornou um status inválido de acesso de proprietário.');
    return json.status;
  }

  public async getOwnerDashboard(
    accessToken: string,
    from: string,
    to: string,
  ): Promise<OwnerDashboardData> {
    const query = new URLSearchParams({ from, to });
    const res = await apiFetch(`/api/owner/dashboard?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar o painel de proprietário.',
      );
    }
    if (!isOwnerDashboardData(json)) {
      throw new Error('A API retornou dados inválidos para o painel de proprietário.');
    }
    return {
      ...json,
      properties: json.properties.map((property) => ({
        ...property,
        image: isSafeMediaUrl(property.image) ? property.image : '',
      })),
      reservations: json.reservations.map((reservation) => ({
        ...reservation,
        propertyImage: isSafeMediaUrl(reservation.propertyImage) ? reservation.propertyImage : '',
      })),
    };
  }

  public async getOwnerAccountingDetails(
    accessToken: string,
    entryId: string,
    listingId: string,
    from: string,
    to: string,
  ): Promise<OwnerAccountingDetails> {
    const query = new URLSearchParams({ listingId, from, to });
    const res = await fetch(
      `/api/owner/accounting/entries/${encodeURIComponent(entryId)}/details?${query}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || !isRecord(json.details)) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar os detalhes do lançamento.',
      );
    }
    const detail = json.details;
    const isFee = (value: unknown): value is OwnerAccountingDetails['fees'][number] =>
      isRecord(value) && typeof value.label === 'string' && isFiniteNumber(value.amount);
    const isLedgerEntry = (value: unknown): value is OwnerAccountingDetails['ledgerEntry'] =>
      isRecord(value) &&
      typeof value.date === 'string' &&
      (value.type === 'debit' || value.type === 'credit') &&
      typeof value.status === 'string' &&
      typeof value.description === 'string' &&
      isFiniteNumber(value.amount);
    if (
      typeof detail.reservationCode !== 'string' ||
      typeof detail.guestName !== 'string' ||
      typeof detail.checkIn !== 'string' ||
      typeof detail.checkOut !== 'string' ||
      !isFiniteNumber(detail.nights) ||
      !Array.isArray(detail.fees) ||
      !detail.fees.every(isFee) ||
      !isFiniteNumber(detail.payout) ||
      !isLedgerEntry(detail.ledgerEntry)
    ) {
      throw new Error('A API retornou detalhes financeiros inválidos.');
    }
    return detail as unknown as OwnerAccountingDetails;
  }

  public async createOwnerCalendarBlock(
    accessToken: string,
    input: { listingId: string; from: string; to: string; reason?: string },
  ): Promise<void> {
    const res = await fetch('/api/owner/calendar/blocks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || json.status !== 'blocked') {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível bloquear essas datas.',
      );
    }
  }

  public async getOwnerAdminStatus(accessToken: string): Promise<{
    isAdmin: boolean;
    canManagePayments: boolean;
  }> {
    const res = await apiFetch('/api/owner/admin/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      typeof json.isAdmin !== 'boolean' ||
      typeof json.canManagePayments !== 'boolean'
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível verificar o acesso administrativo.',
      );
    }
    return { isAdmin: json.isAdmin, canManagePayments: json.canManagePayments };
  }

  public async getOwnerAccessRequests(accessToken: string): Promise<OwnerAccessRequest[]> {
    const res = await apiFetch('/api/owner/admin/requests', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar as solicitações.',
      );
    }
    if (!Array.isArray(json.requests) || !json.requests.every(isOwnerAccessRequest)) {
      throw new Error('A API retornou dados inválidos para as solicitações.');
    }
    return json.requests;
  }

  public async getDirectBookingOperationsOrders(
    accessToken: string,
    page = 1,
    webhookPage = 1,
  ): Promise<DirectBookingOperationsPage> {
    const params = new URLSearchParams({ page: String(page), webhookPage: String(webhookPage) });
    const res = await apiFetch(`/api/owner/admin/direct-booking-orders?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível carregar os pedidos em conferência.',
      );
    }
    if (
      !Array.isArray(json.orders) ||
      !json.orders.every(isDirectBookingOperationsOrder) ||
      !Array.isArray(json.unmatchedWebhooks) ||
      !json.unmatchedWebhooks.every(isDirectBookingOperationsWebhook) ||
      !Number.isInteger(json.unmatchedWebhookTotal) ||
      (json.unmatchedWebhookTotal as number) < json.unmatchedWebhooks.length ||
      !Number.isInteger(json.unmatchedWebhookCurrentPage) ||
      (json.unmatchedWebhookCurrentPage as number) < 1 ||
      !Number.isInteger(json.unmatchedWebhookLastPage) ||
      (json.unmatchedWebhookLastPage as number) < 1 ||
      !Number.isInteger(json.currentPage) ||
      (json.currentPage as number) < 1 ||
      !Number.isInteger(json.lastPage) ||
      (json.lastPage as number) < 0 ||
      !Number.isInteger(json.total) ||
      (json.total as number) < 0
    ) {
      throw new Error('A API retornou dados inválidos para os pedidos em conferência.');
    }
    return {
      orders: json.orders,
      unmatchedWebhooks: json.unmatchedWebhooks,
      unmatchedWebhookTotal: json.unmatchedWebhookTotal as number,
      unmatchedWebhookCurrentPage: json.unmatchedWebhookCurrentPage as number,
      unmatchedWebhookLastPage: json.unmatchedWebhookLastPage as number,
      currentPage: json.currentPage as number,
      lastPage: json.lastPage as number,
      total: json.total as number,
    };
  }

  public async retryDirectBookingWebhook(accessToken: string, webhookId: string): Promise<void> {
    const res = await apiFetch(
      `/api/owner/admin/direct-booking-webhooks/${encodeURIComponent(webhookId)}/retry`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || json.status !== 'queued') {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível reenviar a notificação para conciliação.',
      );
    }
  }

  public async startManualDirectBookingCancellation(
    accessToken: string,
    publicReference: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await apiFetch(
      `/api/owner/admin/direct-booking-orders/${encodeURIComponent(publicReference)}/start-manual-cancellation`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.status !== 'reembolso_pendente' ||
      !Array.isArray(json.requiredActions) ||
      !json.requiredActions.includes('stays_cancellation') ||
      !json.requiredActions.includes('gateway_refund')
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível registrar o encaminhamento manual.',
      );
    }
  }

  public async verifyManualDirectBookingStaysCancellation(
    accessToken: string,
    publicReference: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await apiFetch(
      `/api/owner/admin/direct-booking-orders/${encodeURIComponent(publicReference)}/verify-manual-stays-cancellation`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.staysCancellationConfirmed !== true ||
      typeof json.gatewayRefundConfirmed !== 'boolean'
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível confirmar o cancelamento na Stays.',
      );
    }
  }

  public async verifyManualDirectBookingGatewayRefund(
    accessToken: string,
    publicReference: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await apiFetch(
      `/api/owner/admin/direct-booking-orders/${encodeURIComponent(publicReference)}/verify-manual-gateway-refund`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.gatewayRefundConfirmed !== true
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível confirmar o estorno no Mercado Pago.',
      );
    }
  }

  public async revokeDirectBookingResumeToken(
    accessToken: string,
    publicReference: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await apiFetch(
      `/api/owner/admin/direct-booking-orders/${encodeURIComponent(publicReference)}/revoke-resume-token`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      (json.status !== 'revoked' && json.status !== 'already_revoked')
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível revogar a credencial de retomada.',
      );
    }
  }

  public async searchStaysOwners(accessToken: string, query: string): Promise<StaysOwnerSummary[]> {
    const params = new URLSearchParams({ q: query });
    const res = await apiFetch(`/api/owner/admin/stays-owners?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível pesquisar os proprietários na Stays.',
      );
    }
    if (!Array.isArray(json.owners) || !json.owners.every(isStaysOwnerSummary)) {
      throw new Error('A API retornou dados inválidos para os proprietários da Stays.');
    }
    return json.owners;
  }

  public async approveOwnerAccess(
    accessToken: string,
    userId: string,
    staysOwnerId: string,
  ): Promise<void> {
    const res = await apiFetch('/api/owner/admin/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, staysOwnerId, identityVerified: true }),
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || json.status !== 'approved') {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível aprovar o acesso.',
      );
    }
  }

  public async rejectOwnerAccess(accessToken: string, userId: string): Promise<void> {
    const res = await apiFetch('/api/owner/admin/reject', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || json.status !== 'rejected') {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível recusar o acesso.',
      );
    }
  }

  // 7. GET /api/stays/status
  public async getStaysStatus(): Promise<StaysStatusResponse | null> {
    try {
      const res = await apiFetch('/api/stays/status');
      if (!res.ok) return null;
      const json: unknown = await res.json();
      if (
        !isRecord(json) ||
        typeof json.connected !== 'boolean' ||
        typeof json.hasCredentials !== 'boolean' ||
        !isFiniteNumber(json.totalProperties) ||
        json.totalProperties < 0 ||
        (json.environment !== undefined && typeof json.environment !== 'string') ||
        (json.message !== undefined && typeof json.message !== 'string')
      )
        return null;
      return {
        connected: json.connected,
        hasCredentials: json.hasCredentials,
        totalProperties: json.totalProperties,
        ...(typeof json.environment === 'string' ? { environment: json.environment } : {}),
        ...(typeof json.message === 'string' ? { message: json.message } : {}),
      };
    } catch {
      return null;
    }
  }

  // 8. POST /api/sofia/chat
  public async chatWithSofia(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<SofiaChatResponse> {
    try {
      const res = await apiFetch('/api/sofia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const result: unknown = await res.json();
      if (!res.ok || !isRecord(result) || result.success !== true) {
        return {
          success: false,
          reply:
            isRecord(result) && typeof result.message === 'string'
              ? result.message
              : 'A Sofia está temporariamente indisponível. Tente novamente em instantes.',
          matchedProperties: [],
        };
      }
      if (
        typeof result.reply !== 'string' ||
        !Array.isArray(result.matchedProperties) ||
        !result.matchedProperties.every(isProperty) ||
        (result.suggestedFilters !== undefined && !isSuggestedFilters(result.suggestedFilters)) ||
        (result.totalFound !== undefined &&
          (!isFiniteNumber(result.totalFound) ||
            !Number.isInteger(result.totalFound) ||
            result.totalFound < 0)) ||
        (result.assistant !== undefined &&
          result.assistant !== 'openai' &&
          result.assistant !== 'catalog')
      ) {
        return {
          success: false,
          reply: 'A Sofia retornou uma resposta inválida. Tente novamente em instantes.',
          matchedProperties: [],
        };
      }
      return {
        success: true,
        reply: result.reply,
        matchedProperties: result.matchedProperties,
        ...(isSuggestedFilters(result.suggestedFilters)
          ? { suggestedFilters: result.suggestedFilters }
          : {}),
        ...(typeof result.totalFound === 'number' ? { totalFound: result.totalFound } : {}),
        ...(result.assistant === 'openai' || result.assistant === 'catalog'
          ? { assistant: result.assistant }
          : {}),
      };
    } catch (err) {
      console.warn('Fallback local Sofia processing:', err);
      return {
        success: true,
        reply:
          'Não consegui consultar a Sofia agora. Tente novamente em instantes ou pesquise as acomodações diretamente no site.',
        matchedProperties: [],
      };
    }
  }
}

export const crcnBackendApi = new CrcnBackendApiService();
