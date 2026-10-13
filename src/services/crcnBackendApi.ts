import type { Property, Reservation } from '../types';
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
  isCheckoutQuoteUpdate,
  isSafeStaysCheckoutUrl,
  isStaysCalendarDay,
} from '../utils/apiValidation';
import { isOwnerDashboardData } from '../utils/ownerDashboardValidation';
import { isSafeMediaUrl, sanitizePropertyMedia } from '../utils/propertyMedia';

export interface SearchAccommodationsParams {
  from?: string;
  to?: string;
  guests?: number;
  destination?: string;
  propertyId?: string;
  cities?: string[];
  limit?: number;
  skip?: number;
}

export interface CalculatedPriceResponse {
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

export interface CheckoutRequestPayload {
  listingId: string;
  from: string;
  to: string;
  guests: { adults: number; children: number; infants: number; pets: number };
  quoteTotal: number;
}

export interface CheckoutQuoteUpdate {
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
  source: 'stays-live';
  breakdown?: CalculatedPriceResponse['breakdown'];
  cleaningIncluded?: boolean;
  feesIncluded?: boolean;
}

export type CheckoutResponse =
  | {
      success: true;
      status: 'checkout_pending';
      checkoutUrl: string;
      redirectUrl: string;
      quote: CheckoutQuoteUpdate;
    }
  | {
      success: false;
      code?: string;
      message?: string;
      status?: string;
      quote?: CheckoutQuoteUpdate;
    };

export interface StaysStatusResponse {
  connected: boolean;
  hasCredentials: boolean;
  totalProperties: number;
  environment?: string;
  message?: string;
}

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

const getStayNights = (from: string, to: string): number => {
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) return -1;
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
};

const matchesRequestedListing = (quote: CheckoutQuoteUpdate, listingId: string): boolean =>
  quote.staysListingId !== undefined
    ? quote.staysListingId === listingId
    : quote.listingId === listingId;

export type OwnerAccessStatus = 'none' | 'pending' | 'approved' | 'suspended';

export interface OwnerAccessRequest {
  userId: string;
  fullName: string;
  email: string;
  requestedAt: string;
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
    total: number;
    currency: string;
    nights: number;
  }>;
}

class CrcnBackendApiService {
  private getCachedResorts(): Array<{ id: string; name: string }> {
    try {
      const cachedValue: unknown = JSON.parse(localStorage.getItem('hospeda_properties') || '[]');
      const cached = Array.isArray(cachedValue) ? cachedValue.filter(isProperty) : [];
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
      const res = await fetch('/api/resorts');
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
    const res = await fetch('/api/accommodations');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (
      !isRecord(json) ||
      json.source !== 'stays-live' ||
      !Array.isArray(json.data) ||
      !json.data.every(isProperty)
    ) {
      throw new Error('O catálogo retornou dados inválidos.');
    }
    const accommodations: Property[] = json.data.map(sanitizePropertyMedia);
    if (accommodations.length > 0) {
      try {
        localStorage.setItem('hospeda_properties', JSON.stringify(accommodations));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
      } catch (error) {
        console.warn('Unable to cache the live accommodation catalog:', error);
      }
    } else {
      try {
        localStorage.removeItem('hospeda_properties');
        localStorage.removeItem('hospeda_properties_source');
      } catch (error) {
        console.warn('Unable to clear the accommodation catalog cache:', error);
      }
    }
    return accommodations;
  }

  // 2. GET /api/accommodations/:id
  public async getAccommodationById(id: string): Promise<Property | null> {
    try {
      const res = await fetch(`/api/accommodations/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!isRecord(json) || (json.data !== null && !isProperty(json.data))) {
        throw new Error('A acomodação retornou dados inválidos.');
      }
      const property = json.data ? sanitizePropertyMedia(json.data) : null;
      if (property && Array.isArray(property.images)) {
        try {
          const cachedValue: unknown = JSON.parse(
            localStorage.getItem('hospeda_properties') || '[]',
          );
          const cached = Array.isArray(cachedValue) ? cachedValue.filter(isProperty) : [];
          const index = cached.findIndex(
            (item) => item.id === property.id || item.staysListingId === property.staysListingId,
          );
          if (index >= 0) cached[index] = property;
          else cached.push(property);
          localStorage.setItem('hospeda_properties', JSON.stringify(cached));
          localStorage.setItem('hospeda_properties_source', 'stays-live');
        } catch (error) {
          console.warn('Unable to persist refreshed accommodation gallery:', error);
        }
      }
      return property;
    } catch (err) {
      console.warn(`Falling back to local cache for accommodation ${id}:`, err);
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      return STAYS_NET_APARTMENTS.find((p) => p.id === id || p.staysListingId === id) || null;
    }
  }

  // 3. POST /api/search
  public async searchAccommodations(params: SearchAccommodationsParams): Promise<{
    total: number;
    data: Property[];
  }> {
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (
        !isRecord(json) ||
        !isFiniteNumber(json.total) ||
        !Number.isInteger(json.total) ||
        json.total < 0 ||
        !Array.isArray(json.data) ||
        !json.data.every(isProperty)
      ) {
        throw new Error('A pesquisa retornou uma resposta inválida.');
      }
      return { total: json.total, data: json.data.map(sanitizePropertyMedia) };
    } catch (err) {
      console.warn('Falling back to local search filtering:', err);
      if (params.from && params.to) {
        // A static catalog cannot confirm availability or provide a date-specific quote.
        return { total: 0, data: [] };
      }
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      let filtered = STAYS_NET_APARTMENTS;
      if (params.guests && params.guests > 1) {
        filtered = filtered.filter((p) => p.maxGuests >= (params.guests || 1));
      }
      if (params.destination) {
        const q = params.destination.toLowerCase();
        filtered = filtered.filter(
          (p) => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q),
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
      const res = await fetch(
        `/api/accommodations/${encodeURIComponent(id)}/calendar?${query.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!isRecord(json) || !Array.isArray(json.data) || !json.data.every(isStaysCalendarDay)) {
        return [];
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
      const res = await fetch('/api/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingIds: [payload.listingId],
          from: payload.from,
          to: payload.to,
          guests: payload.guests || 2,
          promocode: payload.promocode,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!isCalculatedPriceResponse(json)) {
        throw new Error('A resposta de preço retornou dados inválidos.');
      }
      return json;
    } catch (err) {
      console.warn('Error calculating price on backend:', err);
      return null;
    }
  }

  // 6. POST /api/checkout
  public async syncStaysGuest(
    accessToken: string,
  ): Promise<{ success: boolean; message?: string } | null> {
    try {
      const res = await fetch('/api/auth/sync-stays', {
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

  public async createCheckout(
    payload: CheckoutRequestPayload,
    accessToken: string,
  ): Promise<CheckoutResponse | null> {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.status >= 500) return null;
      const json: unknown = await res.json();
      if (!isRecord(json) || typeof json.success !== 'boolean') return null;
      if (!json.success) {
        if (res.ok) return null;
        const quote =
          json.code === 'quote_changed' && isCheckoutQuoteUpdate(json.quote)
            ? json.quote
            : undefined;
        if (
          json.code === 'quote_changed' &&
          (!quote ||
            !matchesRequestedListing(quote, payload.listingId) ||
            quote.nights !== getStayNights(payload.from, payload.to))
        )
          return null;
        return {
          success: false as const,
          ...(typeof json.code === 'string' ? { code: json.code } : {}),
          ...(typeof json.message === 'string' ? { message: json.message } : {}),
          ...(quote ? { quote } : {}),
        };
      }
      const quote = isCheckoutQuoteUpdate(json.quote) ? json.quote : undefined;
      if (
        json.status !== 'checkout_pending' ||
        !isSafeStaysCheckoutUrl(json.checkoutUrl) ||
        !isSafeStaysCheckoutUrl(json.redirectUrl) ||
        !quote ||
        !matchesRequestedListing(quote, payload.listingId) ||
        quote.nights !== getStayNights(payload.from, payload.to)
      )
        return null;
      return {
        success: true,
        status: 'checkout_pending',
        checkoutUrl: json.checkoutUrl,
        redirectUrl: json.redirectUrl,
        quote,
      };
    } catch (err) {
      console.warn('Error creating checkout on backend:', err);
      return null;
    }
  }

  public async getMyReservations(accessToken: string): Promise<Reservation[]> {
    const res = await fetch('/api/my-reservations', {
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

  public async cancelMyReservation(reservationId: string, accessToken: string): Promise<void> {
    const res = await fetch(`/api/my-reservations/${encodeURIComponent(reservationId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.reservationId !== reservationId
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível cancelar esta reserva.',
      );
    }
  }

  public async getOwnerAccess(accessToken: string): Promise<OwnerAccessStatus> {
    const res = await fetch('/api/owner/access', {
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
    const res = await fetch('/api/owner/access/request', {
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
    const res = await fetch(`/api/owner/dashboard?${query}`, {
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

  public async getOwnerAdminStatus(accessToken: string): Promise<boolean> {
    const res = await fetch('/api/owner/admin/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json();
    if (!res.ok || !isRecord(json) || json.success !== true || typeof json.isAdmin !== 'boolean') {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível verificar o acesso administrativo.',
      );
    }
    return json.isAdmin;
  }

  public async getOwnerAccessRequests(accessToken: string): Promise<OwnerAccessRequest[]> {
    const res = await fetch('/api/owner/admin/requests', {
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

  public async searchStaysOwners(accessToken: string, query: string): Promise<StaysOwnerSummary[]> {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`/api/owner/admin/stays-owners?${params}`, {
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
    const res = await fetch('/api/owner/admin/approve', {
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

  // 7. GET /api/stays/status
  public async getStaysStatus(): Promise<StaysStatusResponse | null> {
    try {
      const res = await fetch('/api/stays/status');
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
      const res = await fetch('/api/sofia/chat', {
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
