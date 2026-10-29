import {
  isDirectBookingCancellationReceipt,
  isDirectBookingOrder,
  isRecord,
} from '../utils/apiValidation';
import { saveCheckoutResumeToken } from '../utils/checkoutResumeStorage';
import { apiFetch } from './apiFetch';
import { readMeasurementAttribution, type AttributionTouch } from '../utils/measurementAttribution';
import { readMeasurementConsent } from '../utils/measurementConsent';

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

interface CheckoutMarketingAttribution {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
}

function getCheckoutMarketingAttribution(): CheckoutMarketingAttribution | undefined {
  if (typeof window === 'undefined') return undefined;

  const consent = readMeasurementConsent();
  if (!consent) return undefined;

  const attribution = readMeasurementAttribution(consent);
  if (!attribution) return undefined;

  return {
    firstTouch: attribution.firstTouch,
    lastTouch: attribution.lastTouch,
  };
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
  expiresAt: string | null;
  createdAt: string | null;
  cancellationReceipt?: DirectBookingCancellationReceipt | null;
}

export type DirectBookingOrderListItem = Omit<DirectBookingOrderSummary, 'guestName'>;

export interface DirectBookingCancellationReceipt {
  protocol: string;
  requestedAt: string;
}

export interface CheckoutResumeCredentials {
  reference: string;
  token: string;
  path: string;
  expiresAt: string;
}

export type CheckoutAccessCredentials =
  { type: 'authenticated'; accessToken: string } | { type: 'resume-token'; resumeToken: string };

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
  baseAmount?: string | null;
  processingFeeAmount?: string | null;
  processingFeeRate?: string | null;
  currency: 'BRL';
  expiresAt: string | null;
  paidAt: string | null;
  checkoutUrl?: string | null;
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

export interface CheckoutCancellationResult {
  cancellationReceipt: DirectBookingCancellationReceipt;
  alreadyRequested: boolean;
  message: string;
}

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
  provider: 'mercadopago' | 'cielo_sandbox' | 'cielo' | 'cielo_hosted' | 'unavailable';
}

export interface CieloSopAccessToken {
  environment: 'sandbox' | 'production';
  accessToken: string;
}

export interface CheckoutReadinessResponse {
  success: true;
  ready: boolean;
  termsAvailable: boolean;
  checkoutEnabled: boolean;
  singlePageCheckoutEnabled?: boolean;
  parkTicketsPreviewEnabled?: boolean;
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

const isCheckoutResumeCredentials = (value: unknown): value is CheckoutResumeCredentials =>
  isRecord(value) &&
  typeof value.reference === 'string' &&
  /^[A-Za-z0-9]{40}$/.test(value.reference) &&
  typeof value.token === 'string' &&
  /^[A-Za-z0-9]{64}$/.test(value.token) &&
  value.path === `/checkout/${value.reference}` &&
  typeof value.expiresAt === 'string' &&
  Number.isFinite(Date.parse(value.expiresAt)) &&
  Date.parse(value.expiresAt) > Date.now();

const isCheckoutPaymentCapabilities = (value: unknown): value is CheckoutPaymentCapabilities =>
  isRecord(value) &&
  typeof value.enabled === 'boolean' &&
  (value.provider === 'mercadopago' ||
    value.provider === 'cielo_sandbox' ||
    value.provider === 'cielo' ||
    value.provider === 'cielo_hosted' ||
    value.provider === 'unavailable') &&
  Array.isArray(value.methods) &&
  value.methods.every((method) => method === 'pix' || method === 'card') &&
  value.enabled === value.methods.length > 0 &&
  (value.publicKey === null ||
    (typeof value.publicKey === 'string' &&
      value.publicKey.trim() !== '' &&
      value.publicKey.length <= 255)) &&
  (value.provider === 'mercadopago'
    ? value.methods.includes('card') === (typeof value.publicKey === 'string')
    : value.publicKey === null &&
      (value.provider === 'cielo_hosted'
        ? value.methods.length === 1 && value.methods[0] === 'card'
        : !value.methods.includes('card') ||
          value.provider === 'cielo_sandbox' ||
          value.provider === 'cielo'));

const isCieloSopAccessToken = (value: unknown): value is CieloSopAccessToken =>
  isRecord(value) &&
  value.success === true &&
  (value.environment === 'sandbox' || value.environment === 'production') &&
  typeof value.accessToken === 'string' &&
  value.accessToken.trim() !== '' &&
  value.accessToken.length <= 4096;

const isCheckoutReadinessResponse = (value: unknown): value is CheckoutReadinessResponse =>
  isRecord(value) &&
  value.success === true &&
  typeof value.ready === 'boolean' &&
  typeof value.termsAvailable === 'boolean' &&
  typeof value.checkoutEnabled === 'boolean' &&
  (value.singlePageCheckoutEnabled === undefined ||
    typeof value.singlePageCheckoutEnabled === 'boolean') &&
  (value.parkTicketsPreviewEnabled === undefined ||
    typeof value.parkTicketsPreviewEnabled === 'boolean') &&
  isCheckoutPaymentCapabilities(value.payment) &&
  (value.singlePageCheckoutEnabled !== true ||
    (value.ready === true &&
      ['cielo', 'cielo_sandbox'].includes(value.payment.provider) &&
      value.payment.methods.includes('card'))) &&
  (value.parkTicketsPreviewEnabled !== true || value.singlePageCheckoutEnabled === true) &&
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

function isSafeCieloCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      ['cieloecommerce.cielo.com.br', 'cielolink.com.br', 'www.cielolink.com.br'].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

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
    (value.baseAmount !== undefined &&
      value.baseAmount !== null &&
      (typeof value.baseAmount !== 'string' || !/^\d+(?:\.\d{2})$/.test(value.baseAmount))) ||
    (value.processingFeeAmount !== undefined &&
      value.processingFeeAmount !== null &&
      (typeof value.processingFeeAmount !== 'string' ||
        !/^\d+(?:\.\d{2})$/.test(value.processingFeeAmount))) ||
    (value.processingFeeRate !== undefined &&
      value.processingFeeRate !== null &&
      (typeof value.processingFeeRate !== 'string' ||
        !/^\d{1,2}(?:\.\d{2})$/.test(value.processingFeeRate))) ||
    value.currency !== 'BRL' ||
    (value.expiresAt !== null &&
      (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))) ||
    (value.paidAt !== null &&
      (typeof value.paidAt !== 'string' || !Number.isFinite(Date.parse(value.paidAt)))) ||
    (value.checkoutUrl !== undefined &&
      value.checkoutUrl !== null &&
      !isSafeCieloCheckoutUrl(value.checkoutUrl))
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

export const checkoutApi = {
  async createCheckout(payload: CheckoutRequestPayload): Promise<CheckoutResponse | null> {
    try {
      const marketingAttribution = getCheckoutMarketingAttribution();
      const res = await apiFetch('/api/checkout', {
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
          ...(marketingAttribution ? { marketingAttribution } : {}),
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
          payment: { enabled: false, methods: [], publicKey: null, provider: 'unavailable' },
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
      if (resume) saveCheckoutResumeToken(resume.reference, resume.token, resume.expiresAt);

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
  },

  async createCheckoutPayment(
    reference: string,
    credentials: CheckoutAccessCredentials | string,
    expectedAmount: string,
    payload: CheckoutPaymentRequestPayload,
  ): Promise<CheckoutPaymentResult> {
    const checkoutCredentials: CheckoutAccessCredentials =
      typeof credentials === 'string'
        ? { type: 'resume-token', resumeToken: credentials }
        : credentials;
    if (
      !/^[A-Za-z0-9]{40}$/.test(reference) ||
      (checkoutCredentials.type === 'resume-token' &&
        !/^[A-Za-z0-9]{64}$/.test(checkoutCredentials.resumeToken)) ||
      (checkoutCredentials.type === 'authenticated' &&
        checkoutCredentials.accessToken.trim() === '') ||
      !/^[A-Za-z0-9._~-]{16,128}$/.test(payload.idempotencyKey) ||
      !/^\d{1,8}\.\d{2}$/.test(expectedAmount) ||
      Number(expectedAmount) <= 0
    ) {
      return { kind: 'unavailable' };
    }

    const { idempotencyKey, ...paymentData } = payload;

    try {
      const authenticated = checkoutCredentials.type === 'authenticated';
      const endpoint = authenticated
        ? `/api/my-direct-booking-orders/${encodeURIComponent(reference)}/checkout/payments`
        : `/api/checkout/${encodeURIComponent(reference)}/payments`;
      const res = await apiFetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...(checkoutCredentials.type === 'authenticated'
            ? { Authorization: `Bearer ${checkoutCredentials.accessToken}` }
            : { 'X-Checkout-Resume-Token': checkoutCredentials.resumeToken }),
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
  },

  async createCieloCheckout(
    reference: string,
    resumeToken: string,
    expectedAmount: string,
    idempotencyKey: string,
  ): Promise<CheckoutPaymentResult> {
    if (
      !/^[A-Za-z0-9]{40}$/.test(reference) ||
      !/^[A-Za-z0-9]{64}$/.test(resumeToken) ||
      !/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey) ||
      !/^\d{1,8}\.\d{2}$/.test(expectedAmount) ||
      Number(expectedAmount) <= 0
    ) {
      return { kind: 'unavailable' };
    }

    try {
      const response = await apiFetch(
        `/api/checkout/${encodeURIComponent(reference)}/cielo-checkout`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'X-Checkout-Resume-Token': resumeToken,
          },
          body: JSON.stringify({ idempotencyKey }),
        },
      );

      if (response.status === 404) return { kind: 'not-found' };
      if (response.status === 422) return { kind: 'invalid' };

      const json: unknown = await response.json();
      if (
        !isCheckoutPaymentResponse(json) ||
        (response.ok && !json.success) ||
        (!response.ok && json.success) ||
        (json.payment &&
          (json.payment.method !== 'card' ||
            Math.round(Number(json.payment.amount) * 100) !==
              Math.round(Number(expectedAmount) * 100))) ||
        (json.success && (!json.payment || !json.payment.checkoutUrl))
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
  },

  async getCieloSopAccessToken(
    reference: string,
    credentials: CheckoutAccessCredentials | null,
  ): Promise<CieloSopAccessToken | null> {
    if (!/^[A-Za-z0-9]{40}$/.test(reference) || credentials === null) return null;
    if (
      (credentials.type === 'resume-token' && !/^[A-Za-z0-9]{64}$/.test(credentials.resumeToken)) ||
      (credentials.type === 'authenticated' && credentials.accessToken.trim() === '')
    ) {
      return null;
    }

    try {
      const authenticated = credentials.type === 'authenticated';
      const endpoint = authenticated
        ? `/api/my-direct-booking-orders/${encodeURIComponent(reference)}/checkout/payments/cielo-sop-token`
        : `/api/checkout/${encodeURIComponent(reference)}/payments/cielo-sop-token`;
      const res = await apiFetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: authenticated
          ? { Authorization: `Bearer ${credentials.accessToken}` }
          : { 'X-Checkout-Resume-Token': credentials.resumeToken },
      });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      return isCieloSopAccessToken(json) ? json : null;
    } catch (err) {
      console.warn('Error loading Cielo SOP access token:', err);
      return null;
    }
  },

  async getCheckoutTerms(listingId: string): Promise<CheckoutTermsResult> {
    if (!listingId.trim() || listingId.length > 100) return { kind: 'unavailable' };

    try {
      const res = await apiFetch(`/api/checkout/terms/${encodeURIComponent(listingId)}`, {
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
  },

  async getCheckoutReadiness(listingId: string): Promise<CheckoutReadinessResult> {
    if (!listingId.trim() || listingId.length > 100) return { kind: 'unavailable' };

    try {
      const res = await apiFetch(`/api/checkout/readiness/${encodeURIComponent(listingId)}`, {
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
  },

  async resumeCheckout(
    reference: string,
    credentials: CheckoutAccessCredentials | string,
  ): Promise<CheckoutResumeResult> {
    const checkoutCredentials: CheckoutAccessCredentials =
      typeof credentials === 'string'
        ? { type: 'resume-token', resumeToken: credentials }
        : credentials;
    if (
      !/^[A-Za-z0-9]{40}$/.test(reference) ||
      (checkoutCredentials.type === 'resume-token' &&
        !/^[A-Za-z0-9]{64}$/.test(checkoutCredentials.resumeToken)) ||
      (checkoutCredentials.type === 'authenticated' &&
        checkoutCredentials.accessToken.trim() === '')
    ) {
      return { kind: 'not-found' };
    }

    try {
      const authenticated = checkoutCredentials.type === 'authenticated';
      const endpoint = authenticated
        ? `/api/my-direct-booking-orders/${encodeURIComponent(reference)}/checkout`
        : `/api/checkout/${encodeURIComponent(reference)}`;
      const res = await apiFetch(endpoint, {
        cache: 'no-store',
        headers:
          checkoutCredentials.type === 'authenticated'
            ? { Authorization: `Bearer ${checkoutCredentials.accessToken}` }
            : { 'X-Checkout-Resume-Token': checkoutCredentials.resumeToken },
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
  },

  async requestCheckoutCancellation(
    reference: string,
    credentials: CheckoutAccessCredentials,
  ): Promise<CheckoutCancellationResult> {
    if (!/^[A-Za-z0-9]{40}$/.test(reference)) {
      throw new Error('Referência do pedido inválida.');
    }

    const authenticated = credentials.type === 'authenticated';
    const endpoint = authenticated
      ? `/api/my-direct-booking-orders/${encodeURIComponent(reference)}/cancel`
      : `/api/checkout/${encodeURIComponent(reference)}/cancel`;
    const headers: Record<string, string> = authenticated
      ? { Authorization: `Bearer ${credentials.accessToken}` }
      : { 'X-Checkout-Resume-Token': credentials.resumeToken };
    const res = await apiFetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers,
    });
    const json: unknown = await res.json();
    if (
      !res.ok ||
      !isRecord(json) ||
      json.success !== true ||
      json.cancellationStatus !== 'requested' ||
      typeof json.alreadyRequested !== 'boolean' ||
      typeof json.message !== 'string' ||
      !isDirectBookingCancellationReceipt(json.cancellationReceipt) ||
      json.cancellationReceipt.protocol !== `CANCEL-${reference}`
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
  },
};
