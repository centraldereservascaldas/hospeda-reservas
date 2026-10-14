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
  isDirectBookingOrder,
  isDirectBookingOperationsOrder,
  isDirectBookingOperationsWebhook,
} from '../utils/apiValidation';
import { isOwnerDashboardData } from '../utils/ownerDashboardValidation';
import { isSafeMediaUrl, sanitizePropertyMedia } from '../utils/propertyMedia';
import { saveCheckoutResumeToken } from '../utils/checkoutResumeStorage';

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
  guest: { fullName: string; email: string; phone: string };
  acceptedTermsVersion: string;
  acceptedTerms: true;
  idempotencyKey: string;
}

export interface DirectBookingOrderSummary {
  status:
    | 'iniciado'
    | 'cotado'
    | 'pre_reservado'
    | 'pagamento_pendente'
    | 'pago_em_confirmacao'
    | 'confirmado'
    | 'atencao_operacional'
    | 'expirado'
    | 'pagamento_recusado'
    | 'liberacao_pendente'
    | 'cancelamento_solicitado'
    | 'reembolso_pendente'
    | 'reembolsado'
    | 'contestado'
    | 'concluido';
  publicReference: string;
  reservationConfirmed: boolean;
  listingId: string;
  guestName: string;
  from: string;
  to: string;
  quoteTotal: string;
  currency: 'BRL';
  paymentStatus: string | null;
  resumeToken?: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface CheckoutResumeCredentials {
  reference: string;
  token: string;
  path: string;
}

export interface CheckoutPaymentAttemptSummary {
  status:
    | 'processing'
    | 'pending'
    | 'in_process'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'unknown'
    | 'attention_required';
  method: 'pix' | 'card';
  amount: string;
  currency: 'BRL';
  expiresAt: string | null;
  paidAt: string | null;
  pix: { copyPaste: string | null; qrCodeBase64: string | null } | null;
}

export type CheckoutPaymentRequestPayload =
  | {
      paymentMethod: 'pix';
      paymentMethodId: 'pix';
      idempotencyKey: string;
    }
  | {
      paymentMethod: 'card';
      paymentMethodId: string;
      token: string;
      installments: number;
      cardholderName: string;
      cardholderEmail: string;
      issuerId?: number;
      payerIdentification: { type: 'CPF' | 'CNPJ'; number: string };
      idempotencyKey: string;
    };

export type CheckoutPaymentResult =
  | {
      kind: 'response';
      success: boolean;
      code: string;
      message: string;
      replayed: boolean;
      payment: CheckoutPaymentAttemptSummary | null;
    }
  | { kind: 'invalid'; fieldErrors?: Record<string, string[]> }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

export interface CheckoutResponse {
  success: boolean;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  order?: DirectBookingOrderSummary;
  resume?: CheckoutResumeCredentials;
  payment: CheckoutPaymentCapabilities;
  idempotentReplay: boolean;
}

export interface CheckoutPaymentCapabilities {
  enabled: boolean;
  methods: Array<'pix' | 'card'>;
  publicKey: string | null;
}

export interface CheckoutReadinessResponse {
  success: true;
  ready: boolean;
  termsAvailable: boolean;
  checkoutEnabled: boolean;
  payment: CheckoutPaymentCapabilities;
}

export type CheckoutReadinessResult =
  { kind: 'ready'; data: CheckoutReadinessResponse } | { kind: 'unavailable' };

export interface CheckoutResumeResponse {
  success: true;
  order: DirectBookingOrderSummary;
  confirmation: { reservationCode: string | null; confirmedAt: string | null } | null;
  payment: CheckoutPaymentCapabilities & {
    attempt?: CheckoutPaymentAttemptSummary | null;
  };
}

export interface CheckoutTermsResponse {
  success: true;
  terms: { version: string; snapshot: Record<string, unknown> };
}

export type CheckoutTermsResult =
  { kind: 'ready'; data: CheckoutTermsResponse } | { kind: 'unavailable' };

export type CheckoutResumeResult =
  { kind: 'ready'; data: CheckoutResumeResponse } | { kind: 'not-found' } | { kind: 'unavailable' };

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

const isCheckoutResumeCredentials = (value: unknown): value is CheckoutResumeCredentials =>
  isRecord(value) &&
  typeof value.reference === 'string' &&
  /^[A-Za-z0-9]{40}$/.test(value.reference) &&
  typeof value.token === 'string' &&
  /^[A-Za-z0-9]{64}$/.test(value.token) &&
  value.path === `/checkout/${value.reference}`;

const isCheckoutPaymentCapabilities = (value: unknown): value is CheckoutPaymentCapabilities =>
  isRecord(value) &&
  typeof value.enabled === 'boolean' &&
  Array.isArray(value.methods) &&
  value.methods.every((method) => method === 'pix' || method === 'card') &&
  value.enabled === value.methods.length > 0 &&
  (value.publicKey === null ||
    (typeof value.publicKey === 'string' &&
      value.publicKey.trim() !== '' &&
      value.publicKey.length <= 255)) &&
  value.methods.includes('card') === (typeof value.publicKey === 'string');

const isCheckoutReadinessResponse = (value: unknown): value is CheckoutReadinessResponse =>
  isRecord(value) &&
  value.success === true &&
  typeof value.ready === 'boolean' &&
  typeof value.termsAvailable === 'boolean' &&
  typeof value.checkoutEnabled === 'boolean' &&
  isCheckoutPaymentCapabilities(value.payment) &&
  value.ready === (value.checkoutEnabled && value.termsAvailable && value.payment.enabled);

const checkoutPaymentAttemptStatuses: CheckoutPaymentAttemptSummary['status'][] = [
  'processing',
  'pending',
  'in_process',
  'approved',
  'rejected',
  'cancelled',
  'unknown',
  'attention_required',
];

const isCheckoutPaymentAttempt = (value: unknown): value is CheckoutPaymentAttemptSummary => {
  if (
    !isRecord(value) ||
    !checkoutPaymentAttemptStatuses.includes(
      value.status as CheckoutPaymentAttemptSummary['status'],
    ) ||
    (value.method !== 'pix' && value.method !== 'card') ||
    typeof value.amount !== 'string' ||
    !/^\d+(?:\.\d{2})$/.test(value.amount) ||
    Number(value.amount) <= 0 ||
    value.currency !== 'BRL' ||
    (value.expiresAt !== null &&
      (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))) ||
    (value.paidAt !== null &&
      (typeof value.paidAt !== 'string' || !Number.isFinite(Date.parse(value.paidAt))))
  ) {
    return false;
  }

  if (value.method === 'card') return value.pix === null;
  if (!isRecord(value.pix)) return false;

  return (
    (value.pix.copyPaste === null ||
      (typeof value.pix.copyPaste === 'string' &&
        value.pix.copyPaste.trim() !== '' &&
        value.pix.copyPaste.length <= 1_000)) &&
    (value.pix.qrCodeBase64 === null ||
      (typeof value.pix.qrCodeBase64 === 'string' &&
        value.pix.qrCodeBase64.length <= 100_000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(value.pix.qrCodeBase64)))
  );
};

const isCheckoutPaymentResponse = (
  value: unknown,
): value is {
  success: boolean;
  code: string;
  message: string;
  replayed: boolean;
  payment: CheckoutPaymentAttemptSummary | null;
} =>
  isRecord(value) &&
  typeof value.success === 'boolean' &&
  typeof value.code === 'string' &&
  typeof value.message === 'string' &&
  typeof value.replayed === 'boolean' &&
  (value.payment === null || isCheckoutPaymentAttempt(value.payment));

const isCheckoutResumePayment = (value: unknown): value is CheckoutResumeResponse['payment'] =>
  isRecord(value) &&
  isCheckoutPaymentCapabilities(value) &&
  (value.attempt === undefined ||
    value.attempt === null ||
    isCheckoutPaymentAttempt(value.attempt));

const isCheckoutResumeResponse = (value: unknown): value is CheckoutResumeResponse =>
  isRecord(value) &&
  value.success === true &&
  isDirectBookingOrder(value.order) &&
  (value.order.status === 'confirmado'
    ? value.confirmation !== null
    : value.confirmation === null) &&
  (value.confirmation === null ||
    (isRecord(value.confirmation) &&
      (value.confirmation.reservationCode === null ||
        (typeof value.confirmation.reservationCode === 'string' &&
          value.confirmation.reservationCode.trim() !== '' &&
          value.confirmation.reservationCode.length <= 100)) &&
      (value.confirmation.confirmedAt === null ||
        (typeof value.confirmation.confirmedAt === 'string' &&
          Number.isFinite(Date.parse(value.confirmation.confirmedAt)))))) &&
  isCheckoutResumePayment(value.payment);

const isCheckoutTermsResponse = (value: unknown): value is CheckoutTermsResponse => {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !isRecord(value.terms) ||
    typeof value.terms.version !== 'string' ||
    value.terms.version.trim() === '' ||
    value.terms.version.length > 100 ||
    !isRecord(value.terms.snapshot) ||
    value.terms.snapshot.version !== value.terms.version
  ) {
    return false;
  }

  const fields = Object.entries(value.terms.snapshot).filter(([key]) => key !== 'version');
  if (fields.length === 0 || fields.length > 12) return false;

  let snapshotLength = 0;
  for (const [name, condition] of fields) {
    if (
      name.trim() === '' ||
      name.length > 100 ||
      typeof condition !== 'string' ||
      condition.trim() === '' ||
      condition.length > 3_000
    ) {
      return false;
    }

    snapshotLength += name.length + condition.length;
    if (snapshotLength > 12_000) return false;
  }

  return true;
};

const checkoutFields = new Set([
  'listingId',
  'from',
  'to',
  'guests.adults',
  'guests.children',
  'guests.infants',
  'guests.pets',
  'quoteTotal',
  'guest.fullName',
  'guest.email',
  'guest.phone',
  'acceptedTermsVersion',
  'acceptedTerms',
  'idempotencyKey',
]);

const parseCheckoutFieldErrors = (value: unknown): Record<string, string[]> | undefined => {
  if (!isRecord(value)) return undefined;

  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (!checkoutFields.has(field) || !Array.isArray(messages)) continue;
    const safeMessages = messages
      .filter((message): message is string => typeof message === 'string')
      .map((message) => message.slice(0, 200))
      .slice(0, 3);
    if (safeMessages.length > 0) fieldErrors[field] = safeMessages;
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
};

export type OwnerAccessStatus = 'none' | 'pending' | 'approved' | 'suspended';

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
  paymentApprovedWithoutConfirmedReservation: boolean;
  latePaymentAfterHold: boolean;
  staysActionFailed: boolean;
  confirmationEmail: {
    status: 'pending' | 'queued' | 'processing' | 'sent' | 'failed';
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
  updatedAt: string | null;
  lastEvent: {
    event?: string;
    status?: string;
    source?: string;
    code?: string;
    at?: string;
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

  public async createCheckout(payload: CheckoutRequestPayload): Promise<CheckoutResponse | null> {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': payload.idempotencyKey,
        },
        body: JSON.stringify({
          listingId: payload.listingId,
          from: payload.from,
          to: payload.to,
          guests: payload.guests,
          quoteTotal: payload.quoteTotal,
          guest: payload.guest,
          acceptedTermsVersion: payload.acceptedTermsVersion,
          acceptedTerms: payload.acceptedTerms,
        }),
      });
      const json: unknown = await res.json();
      if (res.status === 422 && isRecord(json)) {
        const fieldErrors = parseCheckoutFieldErrors(json.errors);

        return {
          success: false,
          code: 'invalid_checkout_request',
          message: 'Confira os dados informados antes de continuar.',
          ...(fieldErrors ? { fieldErrors } : {}),
          payment: { enabled: false, methods: [], publicKey: null },
          idempotentReplay: false,
        };
      }
      if (
        !isRecord(json) ||
        typeof json.success !== 'boolean' ||
        (json.code !== undefined && typeof json.code !== 'string') ||
        (json.message !== undefined && typeof json.message !== 'string') ||
        !isCheckoutPaymentCapabilities(json.payment) ||
        typeof json.idempotentReplay !== 'boolean'
      )
        return null;

      const order = json.order;
      const resume = json.resume;
      if (order !== undefined && !isDirectBookingOrder(order)) return null;
      if (resume !== undefined && !isCheckoutResumeCredentials(resume)) return null;
      if ((order === undefined) !== (resume === undefined)) return null;
      if (
        order &&
        (order.listingId !== payload.listingId ||
          order.from !== payload.from ||
          order.to !== payload.to ||
          Math.round(Number(order.quoteTotal) * 100) !== Math.round(payload.quoteTotal * 100) ||
          resume?.reference !== order.publicReference)
      )
        return null;
      if (json.success && (!res.ok || !order || !resume || order.status !== 'pre_reservado'))
        return null;
      if (res.ok && !json.success) return null;
      if (resume) saveCheckoutResumeToken(resume.reference, resume.token);

      return {
        success: json.success,
        ...(typeof json.code === 'string' ? { code: json.code } : {}),
        ...(typeof json.message === 'string' ? { message: json.message } : {}),
        ...(order ? { order } : {}),
        ...(resume ? { resume } : {}),
        payment: json.payment,
        idempotentReplay: json.idempotentReplay,
      };
    } catch (err) {
      console.warn('Error creating checkout on backend:', err);
      return null;
    }
  }

  public async createCheckoutPayment(
    reference: string,
    resumeToken: string,
    expectedAmount: string,
    payload: CheckoutPaymentRequestPayload,
  ): Promise<CheckoutPaymentResult> {
    if (
      !/^[A-Za-z0-9]{40}$/.test(reference) ||
      !/^[A-Za-z0-9]{64}$/.test(resumeToken) ||
      !/^[A-Za-z0-9._~-]{16,128}$/.test(payload.idempotencyKey) ||
      !/^\d{1,8}\.\d{2}$/.test(expectedAmount) ||
      Number(expectedAmount) <= 0
    ) {
      return { kind: 'unavailable' };
    }

    const { idempotencyKey, ...paymentData } = payload;

    try {
      const res = await fetch(`/api/checkout/${encodeURIComponent(reference)}/payments`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Checkout-Resume-Token': resumeToken,
        },
        body: JSON.stringify(paymentData),
      });

      if (res.status === 404) return { kind: 'not-found' };
      if (res.status === 422) {
        const json: unknown = await res.json();
        const fieldErrors = isRecord(json) ? parseCheckoutFieldErrors(json.errors) : undefined;

        return { kind: 'invalid', ...(fieldErrors ? { fieldErrors } : {}) };
      }

      const json: unknown = await res.json();
      if (
        !isCheckoutPaymentResponse(json) ||
        (res.ok && !json.success) ||
        (!res.ok && json.success) ||
        (json.success && !json.payment)
      ) {
        return { kind: 'unavailable' };
      }

      if (
        json.payment &&
        (json.payment.method !== payload.paymentMethod ||
          Math.round(Number(json.payment.amount) * 100) !==
            Math.round(Number(expectedAmount) * 100))
      ) {
        return { kind: 'unavailable' };
      }

      return {
        kind: 'response',
        success: json.success,
        code: json.code,
        message: json.message,
        replayed: json.replayed,
        payment: json.payment,
      };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  public async getCheckoutTerms(listingId: string): Promise<CheckoutTermsResult> {
    if (!listingId.trim() || listingId.length > 100) return { kind: 'unavailable' };

    try {
      const res = await fetch(`/api/checkout/terms/${encodeURIComponent(listingId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return { kind: 'unavailable' };
      const json: unknown = await res.json();

      return isCheckoutTermsResponse(json)
        ? { kind: 'ready', data: json }
        : { kind: 'unavailable' };
    } catch (err) {
      console.warn('Error loading approved checkout terms:', err);
      return { kind: 'unavailable' };
    }
  }

  public async getCheckoutReadiness(listingId: string): Promise<CheckoutReadinessResult> {
    if (!listingId.trim() || listingId.length > 100) return { kind: 'unavailable' };

    try {
      const res = await fetch(`/api/checkout/readiness/${encodeURIComponent(listingId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return { kind: 'unavailable' };
      const json: unknown = await res.json();

      return isCheckoutReadinessResponse(json)
        ? { kind: 'ready', data: json }
        : { kind: 'unavailable' };
    } catch (err) {
      console.warn('Error loading direct checkout readiness:', err);
      return { kind: 'unavailable' };
    }
  }

  public async resumeCheckout(reference: string, token: string): Promise<CheckoutResumeResult> {
    if (!/^[A-Za-z0-9]{40}$/.test(reference) || !/^[A-Za-z0-9]{64}$/.test(token)) {
      return { kind: 'not-found' };
    }

    try {
      const res = await fetch(`/api/checkout/${encodeURIComponent(reference)}`, {
        cache: 'no-store',
        headers: { 'X-Checkout-Resume-Token': token },
      });
      if (res.status === 404) return { kind: 'not-found' };
      if (!res.ok) return { kind: 'unavailable' };
      const json: unknown = await res.json();
      return isCheckoutResumeResponse(json)
        ? { kind: 'ready', data: json }
        : { kind: 'unavailable' };
    } catch (err) {
      console.warn('Error resuming direct checkout:', err);
      return { kind: 'unavailable' };
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

  public async getMyDirectBookingOrders(accessToken: string): Promise<DirectBookingOrderSummary[]> {
    const res = await fetch('/api/my-direct-booking-orders', {
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
    if (!Array.isArray(json.data) || !json.data.every(isDirectBookingOrder)) {
      throw new Error('A API retornou dados inválidos para as compras no site.');
    }
    return json.data;
  }

  public async requestDirectBookingCancellation(
    accessToken: string,
    publicReference: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{40}$/.test(publicReference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const res = await fetch(
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
      typeof json.message !== 'string'
    ) {
      throw new Error(
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : 'Não foi possível registrar a solicitação de cancelamento.',
      );
    }
  }

  public async cancelMyReservation(
    reservationId: string,
    accessToken: string,
  ): Promise<ReservationCancellationResult> {
    const res = await fetch(`/api/my-reservations/${encodeURIComponent(reservationId)}/cancel`, {
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

  public async getDirectBookingOperationsOrders(
    accessToken: string,
    page = 1,
    webhookPage = 1,
  ): Promise<DirectBookingOperationsPage> {
    const params = new URLSearchParams({ page: String(page), webhookPage: String(webhookPage) });
    const res = await fetch(`/api/owner/admin/direct-booking-orders?${params}`, {
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
    const res = await fetch(
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

    const res = await fetch(
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

    const res = await fetch(
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

    const res = await fetch(
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
