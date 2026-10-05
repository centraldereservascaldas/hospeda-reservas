import { Property, Reservation } from '../types';

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

export interface CheckoutResponse {
  success: boolean;
  code?: string;
  message?: string;
  status?: string;
  checkoutUrl?: string;
  redirectUrl?: string;
  quote?: CalculatedPriceResponse;
}

class CrcnBackendApiService {
  private getCachedResorts(): Array<{ id: string; name: string }> {
    try {
      const cached = JSON.parse(localStorage.getItem('hospeda_properties') || '[]') as Property[];
      const byId = new Map<string, string>();
      for (const property of cached) {
        if (property.staysPropertyId && property.complexName?.trim()) {
          byId.set(property.staysPropertyId, property.complexName.trim());
        }
      }
      return Array.from(byId, ([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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
      const json = await res.json();
      const resorts = Array.isArray(json.data) ? json.data : [];
      if (resorts.length > 0) return resorts;
      return this.getCachedResorts();
    } catch (err) {
      console.warn('Could not load live resorts; using synchronized cache when available:', err);
      return this.getCachedResorts();
    }
  }

  // 1. GET /api/accommodations
  public async getAccommodations(): Promise<Property[]> {
    try {
      const res = await fetch('/api/accommodations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const accommodations = Array.isArray(json.data) ? json.data as Property[] : [];
      if (json.source === 'stays-live' && accommodations.length > 0) {
        localStorage.setItem('hospeda_properties', JSON.stringify(accommodations));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
      }
      return accommodations;
    } catch (err) {
      console.warn('Falling back to local cache for accommodations:', err);
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      return STAYS_NET_APARTMENTS;
    }
  }

  // 2. GET /api/accommodations/:id
  public async getAccommodationById(id: string): Promise<Property | null> {
    try {
      const res = await fetch(`/api/accommodations/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const property = json.data as Property | null;
      if (property && Array.isArray(property.images)) {
        try {
          const cached = JSON.parse(localStorage.getItem('hospeda_properties') || '[]') as Property[];
          const index = cached.findIndex((item) => item.id === property.id || item.staysListingId === property.staysListingId);
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
      return STAYS_NET_APARTMENTS.find(p => p.id === id || p.staysListingId === id) || null;
    }
  }

  // 3. POST /api/search
  public async searchAccommodations(params: SearchAccommodationsParams): Promise<{
    total: number;
    data: (Property & { calculatedPrice?: any })[];
  }> {
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { total: json.total || 0, data: json.data || [] };
    } catch (err) {
      console.warn('Falling back to local search filtering:', err);
      if (params.from && params.to) {
        // A static catalog cannot confirm availability or provide a date-specific quote.
        return { total: 0, data: [] };
      }
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      let filtered = STAYS_NET_APARTMENTS;
      if (params.guests && params.guests > 1) {
        filtered = filtered.filter(p => p.maxGuests >= (params.guests || 1));
      }
      if (params.destination) {
        const q = params.destination.toLowerCase();
        filtered = filtered.filter(p => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q));
      }
      return { total: filtered.length, data: filtered };
    }
  }

  // 4. GET /api/accommodations/:id/calendar
  public async getAccommodationCalendar(id: string, from?: string, to?: string): Promise<any[]> {
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const res = await fetch(`/api/accommodations/${encodeURIComponent(id)}/calendar?${query.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data || [];
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
      return await res.json();
    } catch (err) {
      console.warn('Error calculating price on backend:', err);
      return null;
    }
  }

  // 6. POST /api/checkout
  public async syncStaysGuest(accessToken: string): Promise<{ success: boolean; message?: string } | null> {
    try {
      const res = await fetch('/api/auth/sync-stays', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return await res.json();
    } catch (err) {
      console.warn('Error syncing authenticated guest:', err);
      return null;
    }
  }

  public async createCheckout(payload: CheckoutRequestPayload, accessToken: string): Promise<CheckoutResponse | null> {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err) {
      console.warn('Error creating checkout on backend:', err);
      return null;
    }
  }

  public async getMyReservations(accessToken: string): Promise<Reservation[]> {
    const res = await fetch('/api/my-reservations', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Não foi possível carregar suas reservas.');
    return Array.isArray(json.data) ? json.data as Reservation[] : [];
  }

  public async cancelMyReservation(reservationId: string, accessToken: string): Promise<void> {
    const res = await fetch(`/api/my-reservations/${encodeURIComponent(reservationId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Não foi possível cancelar esta reserva.');
  }

  // 7. GET /api/stays/status
  public async getStaysStatus(): Promise<any> {
    try {
      const res = await fetch('/api/stays/status');
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  // 8. POST /api/sofia/chat
  public async chatWithSofia(message: string): Promise<{
    success: boolean;
    reply: string;
    matchedProperties: Property[];
    suggestedFilters?: { destination?: string; guests?: number; from?: string; to?: string };
    totalFound?: number;
  }> {
    try {
      const res = await fetch('/api/sofia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Fallback local Sofia processing:', err);
      const { STAYS_NET_APARTMENTS } = await import('../data/staysApartments');
      const lower = message.toLowerCase();
      let matched = STAYS_NET_APARTMENTS;
      if (lower.includes('lacqua')) {
        matched = STAYS_NET_APARTMENTS.filter(p => p.category === 'diroma' && p.title.toLowerCase().includes('lacqua'));
      }
      return {
        success: true,
        reply: 'Olá! No L’acqua diRoma é permitido descer com seu cooler e bebidas para as áreas de solário das piscinas (apenas latas e plásticos, sem vidro). Selecionei as opções no nosso catálogo:',
        matchedProperties: matched.slice(0, 3),
        suggestedFilters: { destination: "L'acqua diRoma", guests: 5 },
      };
    }
  }
}

export const crcnBackendApi = new CrcnBackendApiService();
