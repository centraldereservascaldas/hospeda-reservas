import type { Property, Reservation } from '../types';
import type { DirectBookingOrderListItem } from '../services/checkoutApi';
import type {
  CalculatedPriceResponse,
  DirectBookingOperationsOrder,
  DirectBookingOperationsWebhook,
} from '../services/crcnBackendApi';
import type { DirectBookingCancellationReceipt } from '../services/checkoutApi';
import type { StaysCalendarDay } from './staysAvailability';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isPositiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

export const isOwnerAccessStatus = (
  value: unknown,
): value is 'none' | 'pending' | 'approved' | 'suspended' =>
  value === 'none' || value === 'pending' || value === 'approved' || value === 'suspended';

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isIsoDateTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
  Number.isFinite(Date.parse(value));

export const isOwnerAccessRequest = (
  value: unknown,
): value is { userId: string; fullName: string; email: string; requestedAt: string } =>
  isRecord(value) &&
  typeof value.userId === 'string' &&
  value.userId.trim() !== '' &&
  typeof value.fullName === 'string' &&
  value.fullName.trim() !== '' &&
  typeof value.email === 'string' &&
  value.email.trim() !== '' &&
  typeof value.requestedAt === 'string' &&
  value.requestedAt.trim() !== '';

export const isStaysOwnerSummary = (
  value: unknown,
): value is { id: string; name: string; propertyCount?: number } =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.trim() !== '' &&
  typeof value.name === 'string' &&
  value.name.trim() !== '' &&
  (value.propertyCount === undefined ||
    (isNonNegativeNumber(value.propertyCount) && Number.isInteger(value.propertyCount)));

const checkoutOrderStatuses = [
  'iniciado',
  'cotado',
  'pre_reservado',
  'liberacao_pendente',
  'pagamento_pendente',
  'pago_em_confirmacao',
  'confirmado',
  'concluido',
  'expirado',
  'pagamento_recusado',
  'atencao_operacional',
  'cancelamento_solicitado',
  'reembolso_pendente',
  'reembolsado',
  'contestado',
] as const;

export const isDirectBookingOrder = (
  value: unknown,
): value is {
  status: (typeof checkoutOrderStatuses)[number];
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
} =>
  isRecord(value) &&
  typeof value.guestName === 'string' &&
  value.guestName.trim() !== '' &&
  isDirectBookingOrderListItem(value);

export const isDirectBookingOrderListItem = (value: unknown): value is DirectBookingOrderListItem =>
  isRecord(value) &&
  checkoutOrderStatuses.includes(value.status as (typeof checkoutOrderStatuses)[number]) &&
  typeof value.publicReference === 'string' &&
  /^[A-Za-z0-9]{40}$/.test(value.publicReference) &&
  typeof value.reservationConfirmed === 'boolean' &&
  typeof value.listingId === 'string' &&
  value.listingId.trim() !== '' &&
  isIsoDate(value.from) &&
  isIsoDate(value.to) &&
  value.to > value.from &&
  typeof value.quoteTotal === 'string' &&
  /^\d+(?:\.\d{2})$/.test(value.quoteTotal) &&
  Number(value.quoteTotal) > 0 &&
  value.currency === 'BRL' &&
  (value.paymentStatus === null || typeof value.paymentStatus === 'string') &&
  (value.expiresAt === null || isIsoDateTime(value.expiresAt)) &&
  (value.createdAt === null || isIsoDateTime(value.createdAt)) &&
  (value.cancellationReceipt === undefined ||
    value.cancellationReceipt === null ||
    isDirectBookingCancellationReceipt(value.cancellationReceipt));

export const isDirectBookingCancellationReceipt = (
  value: unknown,
): value is DirectBookingCancellationReceipt =>
  isRecord(value) &&
  typeof value.protocol === 'string' &&
  /^CANCEL-[A-Za-z0-9]{40}$/.test(value.protocol) &&
  isIsoDateTime(value.requestedAt);

export const isDirectBookingOperationsOrder = (
  value: unknown,
): value is DirectBookingOperationsOrder =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.trim() !== '' &&
  typeof value.publicReference === 'string' &&
  /^[A-Za-z0-9]{40}$/.test(value.publicReference) &&
  checkoutOrderStatuses.includes(value.status as (typeof checkoutOrderStatuses)[number]) &&
  typeof value.listingId === 'string' &&
  value.listingId.trim() !== '' &&
  isIsoDate(value.from) &&
  isIsoDate(value.to) &&
  value.to > value.from &&
  typeof value.guestName === 'string' &&
  typeof value.guestEmail === 'string' &&
  typeof value.quoteTotal === 'string' &&
  /^\d+(?:\.\d{2})$/.test(value.quoteTotal) &&
  value.currency === 'BRL' &&
  (value.paymentStatus === null || typeof value.paymentStatus === 'string') &&
  (value.paymentMethod === null || typeof value.paymentMethod === 'string') &&
  (value.gatewayPaymentId === null || typeof value.gatewayPaymentId === 'string') &&
  (value.staysReservationId === null || typeof value.staysReservationId === 'string') &&
  (value.hasResumeToken === undefined || typeof value.hasResumeToken === 'boolean') &&
  (value.resumeTokenExpiresAt === undefined ||
    value.resumeTokenExpiresAt === null ||
    isIsoDateTime(value.resumeTokenExpiresAt)) &&
  (value.resumeTokenRevocation === undefined ||
    value.resumeTokenRevocation === null ||
    (isRecord(value.resumeTokenRevocation) &&
      (value.resumeTokenRevocation.reviewedBy === null ||
        typeof value.resumeTokenRevocation.reviewedBy === 'string') &&
      (value.resumeTokenRevocation.at === null ||
        isIsoDateTime(value.resumeTokenRevocation.at)))) &&
  typeof value.paymentApprovedWithoutConfirmedReservation === 'boolean' &&
  typeof value.latePaymentAfterHold === 'boolean' &&
  typeof value.staysActionFailed === 'boolean' &&
  (value.confirmationEmail === null || isConfirmationEmailStatus(value.confirmationEmail)) &&
  typeof value.staysCancellationConfirmed === 'boolean' &&
  typeof value.gatewayRefundConfirmed === 'boolean' &&
  (value.manualCancellationReview === null ||
    isManualCancellationReview(value.manualCancellationReview)) &&
  (value.manualGatewayRefundReview === null ||
    isManualGatewayRefundReview(value.manualGatewayRefundReview)) &&
  (value.createdAt === null || isIsoDateTime(value.createdAt)) &&
  (value.updatedAt === null || isIsoDateTime(value.updatedAt)) &&
  (value.lastEvent === null || isDirectBookingOperationsEvent(value.lastEvent)) &&
  (value.issue === null || isDirectBookingOperationsIssue(value.issue));

export const isDirectBookingOperationsWebhook = (
  value: unknown,
): value is DirectBookingOperationsWebhook =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.trim() !== '' &&
  typeof value.gatewayPaymentId === 'string' &&
  value.gatewayPaymentId.trim() !== '' &&
  ['received', 'retrying', 'failed', 'queued', 'processing'].includes(value.status as string) &&
  (value.errorCode === null || typeof value.errorCode === 'string') &&
  Number.isInteger(value.attempts) &&
  (value.attempts as number) >= 0 &&
  typeof value.canRetry === 'boolean' &&
  (value.receivedAt === null || isIsoDateTime(value.receivedAt)) &&
  (value.updatedAt === null || isIsoDateTime(value.updatedAt));

const isDirectBookingOperationsEvent = (
  value: unknown,
): value is NonNullable<DirectBookingOperationsOrder['lastEvent']> =>
  isRecord(value) &&
  [
    'event',
    'status',
    'source',
    'code',
    'at',
    'previous_gateway_status',
    'gateway_status',
    'gateway_updated_at',
  ].every((field) => value[field] === undefined || typeof value[field] === 'string') &&
  (value.at === undefined || isIsoDateTime(value.at)) &&
  (value.gateway_updated_at === undefined || isIsoDateTime(value.gateway_updated_at));

const isManualCancellationReview = (
  value: unknown,
): value is NonNullable<DirectBookingOperationsOrder['manualCancellationReview']> =>
  isRecord(value) &&
  (value.reason === null || typeof value.reason === 'string') &&
  (value.reviewedBy === null || typeof value.reviewedBy === 'string') &&
  (value.at === null || isIsoDateTime(value.at));

const isManualGatewayRefundReview = (
  value: unknown,
): value is NonNullable<DirectBookingOperationsOrder['manualGatewayRefundReview']> =>
  isRecord(value) &&
  (value.reviewedBy === null || typeof value.reviewedBy === 'string') &&
  (value.at === null || isIsoDateTime(value.at));

const isConfirmationEmailStatus = (
  value: unknown,
): value is NonNullable<DirectBookingOperationsOrder['confirmationEmail']> =>
  isRecord(value) &&
  ['pending', 'queued', 'processing', 'sent', 'failed', 'skipped'].includes(
    value.status as string,
  ) &&
  Number.isInteger(value.attempts) &&
  (value.attempts as number) >= 0 &&
  (value.lastAttemptAt === null || isIsoDateTime(value.lastAttemptAt)) &&
  (value.queuedAt === null || isIsoDateTime(value.queuedAt)) &&
  (value.nextAttemptAt === null || isIsoDateTime(value.nextAttemptAt)) &&
  (value.sentAt === null || isIsoDateTime(value.sentAt));

const isDirectBookingOperationsIssue = (
  value: unknown,
): value is NonNullable<DirectBookingOperationsOrder['issue']> =>
  isRecord(value) &&
  typeof value.source === 'string' &&
  (value.action === null || typeof value.action === 'string') &&
  typeof value.status === 'string' &&
  (value.code === null || typeof value.code === 'string') &&
  (value.message === null || typeof value.message === 'string');

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isHighlight = (value: unknown): value is Property['highlights'][number] =>
  isRecord(value) &&
  typeof value.icon === 'string' &&
  typeof value.title === 'string' &&
  typeof value.description === 'string';

const isSleepingArrangement = (value: unknown): value is Property['sleepingArrangements'][number] =>
  isRecord(value) &&
  typeof value.roomName === 'string' &&
  typeof value.bedType === 'string' &&
  typeof value.icon === 'string';

const isReviewRating = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 5;

const isReview = (value: unknown): value is Property['reviews'][number] => {
  if (!isRecord(value) || !isRecord(value.categories)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.authorName === 'string' &&
    (value.authorAvatar === undefined || typeof value.authorAvatar === 'string') &&
    isReviewRating(value.rating) &&
    typeof value.date === 'string' &&
    typeof value.comment === 'string' &&
    (value.source === undefined ||
      value.source === 'airbnb' ||
      value.source === 'bookingcom' ||
      value.source === 'expedia' ||
      value.source === 'internal') &&
    (value.publicationStatus === undefined ||
      value.publicationStatus === 'published' ||
      value.publicationStatus === 'not-published') &&
    Object.values(value.categories).every((score) => score === undefined || isReviewRating(score))
  );
};

const isCalculatedPrice = (value: unknown): value is NonNullable<Property['calculatedPrice']> =>
  isRecord(value) &&
  isFiniteNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  value.nights > 0 &&
  isNonNegativeNumber(value.dailyRate) &&
  isNonNegativeNumber(value.basePrice) &&
  isNonNegativeNumber(value.cleaningFee) &&
  isNonNegativeNumber(value.serviceFee) &&
  isNonNegativeNumber(value.totalAmount) &&
  typeof value.currency === 'string' &&
  (value.fees === undefined || Array.isArray(value.fees));

export const isProperty = (value: unknown): value is Property => {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.host)) return false;
  const propertyType = value.propertyType;
  const calendarIsValid =
    value.calendar === undefined ||
    (Array.isArray(value.calendar) &&
      value.calendar.every(
        (day) =>
          isRecord(day) &&
          isIsoDate(day.date) &&
          isNonNegativeNumber(day.avail) &&
          (day.price === undefined || isNonNegativeNumber(day.price)) &&
          (day.minStay === undefined ||
            (isFiniteNumber(day.minStay) && Number.isInteger(day.minStay) && day.minStay >= 0)) &&
          (day.closedToArrival === undefined || typeof day.closedToArrival === 'boolean') &&
          (day.closedToDeparture === undefined || typeof day.closedToDeparture === 'boolean'),
      ));
  return (
    typeof value.id === 'string' &&
    value.id.trim() !== '' &&
    (value.staysPropertyId === undefined || typeof value.staysPropertyId === 'string') &&
    (value.complexName === undefined || typeof value.complexName === 'string') &&
    (value.complexPageUrl === undefined || typeof value.complexPageUrl === 'string') &&
    (value.complexDescription === undefined || typeof value.complexDescription === 'string') &&
    typeof value.title === 'string' &&
    value.title.trim() !== '' &&
    typeof value.subtitle === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    (propertyType === 'entire_place' ||
      propertyType === 'private_room' ||
      propertyType === 'cabin' ||
      propertyType === 'villa') &&
    typeof value.location.city === 'string' &&
    typeof value.location.state === 'string' &&
    typeof value.location.country === 'string' &&
    typeof value.location.neighborhood === 'string' &&
    typeof value.location.address === 'string' &&
    isFiniteNumber(value.location.lat) &&
    value.location.lat >= -90 &&
    value.location.lat <= 90 &&
    isFiniteNumber(value.location.lng) &&
    value.location.lng >= -180 &&
    value.location.lng <= 180 &&
    isNonNegativeNumber(value.pricePerNight) &&
    isNonNegativeNumber(value.cleaningFee) &&
    isNonNegativeNumber(value.serviceFeeRate) &&
    isFiniteNumber(value.rating) &&
    value.rating >= 0 &&
    value.rating <= 5 &&
    isNonNegativeNumber(value.reviewCount) &&
    Number.isInteger(value.reviewCount) &&
    typeof value.isSuperhost === 'boolean' &&
    typeof value.isGuestFavorite === 'boolean' &&
    typeof value.instantBook === 'boolean' &&
    (value.staysSynced === undefined || typeof value.staysSynced === 'boolean') &&
    (value.reviewsSynced === undefined || typeof value.reviewsSynced === 'boolean') &&
    (value.simulatedData === undefined || typeof value.simulatedData === 'boolean') &&
    (value.dataSource === undefined ||
      value.dataSource === 'stays-live' ||
      value.dataSource === 'stays-simulated' ||
      value.dataSource === 'local-catalog') &&
    isStringArray(value.images) &&
    isNonNegativeNumber(value.bedrooms) &&
    isNonNegativeNumber(value.beds) &&
    isNonNegativeNumber(value.bathrooms) &&
    isPositiveNumber(value.maxGuests) &&
    Number.isInteger(value.maxGuests) &&
    isStringArray(value.amenities) &&
    Array.isArray(value.highlights) &&
    value.highlights.every(isHighlight) &&
    Array.isArray(value.sleepingArrangements) &&
    value.sleepingArrangements.every(isSleepingArrangement) &&
    isStringArray(value.rules) &&
    Array.isArray(value.reviews) &&
    value.reviews.every(isReview) &&
    typeof value.host.name === 'string' &&
    typeof value.host.avatar === 'string' &&
    isFiniteNumber(value.host.joinedYear) &&
    typeof value.host.isSuperhost === 'boolean' &&
    typeof value.host.responseTime === 'string' &&
    typeof value.host.responseRate === 'string' &&
    typeof value.host.bio === 'string' &&
    calendarIsValid &&
    (value.calculatedPrice === undefined || isCalculatedPrice(value.calculatedPrice)) &&
    (value.complexImages === undefined || isStringArray(value.complexImages)) &&
    (value.listingAmenities === undefined || isStringArray(value.listingAmenities)) &&
    (value.propertyAmenities === undefined || isStringArray(value.propertyAmenities)) &&
    (value.staysPropertyId === undefined || typeof value.staysPropertyId === 'string') &&
    (value.staysListingId === undefined || typeof value.staysListingId === 'string') &&
    (value.staysListingObjectId === undefined || typeof value.staysListingObjectId === 'string')
  );
};

const isStaysCalendarPrice = (price: unknown): boolean =>
  isRecord(price) &&
  (price.minStay === undefined ||
    (isFiniteNumber(price.minStay) && Number.isInteger(price.minStay) && price.minStay >= 0)) &&
  (price._mcval === undefined ||
    (isRecord(price._mcval) && Object.values(price._mcval).every(isFiniteNumber)));

export const isStaysCalendarDay = (value: unknown): value is StaysCalendarDay =>
  isRecord(value) &&
  isIsoDate(value.date) &&
  isNonNegativeNumber(value.avail) &&
  (value.closedToArrival === undefined || typeof value.closedToArrival === 'boolean') &&
  (value.closedToDeparture === undefined || typeof value.closedToDeparture === 'boolean') &&
  (value.prices === undefined ||
    (Array.isArray(value.prices) && value.prices.every(isStaysCalendarPrice)));

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

const isFiniteNumberRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(isFiniteNumber);

const isPriceFee = (value: unknown): boolean =>
  isRecord(value) &&
  (value._id === undefined || typeof value._id === 'string') &&
  (value.internalName === undefined || typeof value.internalName === 'string') &&
  (value._mstitle === undefined || isStringRecord(value._mstitle)) &&
  (value._mcval === undefined || isFiniteNumberRecord(value._mcval));

export const isCalculatedPriceResponse = (value: unknown): value is CalculatedPriceResponse =>
  isRecord(value) &&
  value.success === true &&
  typeof value.listingId === 'string' &&
  value.listingId.trim() !== '' &&
  (value.staysListingId === undefined || typeof value.staysListingId === 'string') &&
  isFiniteNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  value.nights > 0 &&
  isNonNegativeNumber(value.dailyRate) &&
  isNonNegativeNumber(value.baseTotal) &&
  isNonNegativeNumber(value.cleaningFee) &&
  isNonNegativeNumber(value.serviceFee) &&
  isNonNegativeNumber(value.discount) &&
  isNonNegativeNumber(value.total) &&
  typeof value.currency === 'string' &&
  value.currency.trim() !== '' &&
  (value.feesIncluded === undefined || typeof value.feesIncluded === 'boolean') &&
  (value.cleaningIncluded === undefined || typeof value.cleaningIncluded === 'boolean') &&
  (value.fees === undefined || (Array.isArray(value.fees) && value.fees.every(isPriceFee))) &&
  (value.source === undefined || typeof value.source === 'string') &&
  isRecord(value.breakdown) &&
  typeof value.breakdown.dailyRateText === 'string' &&
  typeof value.breakdown.cleaningFeeText === 'string' &&
  typeof value.breakdown.serviceFeeText === 'string' &&
  typeof value.breakdown.totalText === 'string';

const isReservationGuests = (value: unknown): value is Reservation['guests'] =>
  isRecord(value) &&
  isFiniteNumber(value.adults) &&
  Number.isInteger(value.adults) &&
  value.adults >= 1 &&
  isFiniteNumber(value.children) &&
  Number.isInteger(value.children) &&
  value.children >= 0 &&
  isFiniteNumber(value.infants) &&
  Number.isInteger(value.infants) &&
  value.infants >= 0 &&
  isFiniteNumber(value.pets) &&
  Number.isInteger(value.pets) &&
  value.pets >= 0;

export const isReservation = (value: unknown): value is Reservation =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.trim() !== '' &&
  typeof value.code === 'string' &&
  typeof value.propertyId === 'string' &&
  typeof value.propertyTitle === 'string' &&
  typeof value.propertyLocation === 'string' &&
  typeof value.propertyImage === 'string' &&
  isIsoDate(value.checkIn) &&
  isIsoDate(value.checkOut) &&
  value.checkOut > value.checkIn &&
  (value.checkInTime === undefined ||
    value.checkInTime === null ||
    typeof value.checkInTime === 'string') &&
  (value.checkOutTime === undefined ||
    value.checkOutTime === null ||
    typeof value.checkOutTime === 'string') &&
  isFiniteNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  value.nights >= 1 &&
  value.nights ===
    (Date.parse(`${value.checkOut}T00:00:00.000Z`) - Date.parse(`${value.checkIn}T00:00:00.000Z`)) /
      86400000 &&
  isReservationGuests(value.guests) &&
  isNonNegativeNumber(value.pricePerNight) &&
  isNonNegativeNumber(value.cleaningFee) &&
  isNonNegativeNumber(value.serviceFee) &&
  isNonNegativeNumber(value.discount) &&
  isNonNegativeNumber(value.totalAmount) &&
  (value.paymentMethod === 'pix' ||
    value.paymentMethod === 'credit_card' ||
    value.paymentMethod === 'apple_pay' ||
    value.paymentMethod === '') &&
  (value.status === 'confirmed' ||
    value.status === 'cancelled' ||
    value.status === 'completed' ||
    value.status === 'pending') &&
  typeof value.createdAt === 'string' &&
  typeof value.hostName === 'string' &&
  typeof value.guestName === 'string' &&
  typeof value.guestEmail === 'string' &&
  typeof value.guestPhone === 'string' &&
  (value.installments === undefined ||
    (isFiniteNumber(value.installments) &&
      Number.isInteger(value.installments) &&
      value.installments >= 1)) &&
  (value.staysReservationId === undefined || typeof value.staysReservationId === 'string') &&
  (value.staysLocator === undefined || typeof value.staysLocator === 'string') &&
  (value.directBookingReference === undefined ||
    (typeof value.directBookingReference === 'string' &&
      /^[A-Za-z0-9]{40}$/.test(value.directBookingReference))) &&
  (value.staysSyncStatus === undefined ||
    value.staysSyncStatus === 'synced' ||
    value.staysSyncStatus === 'pending' ||
    value.staysSyncStatus === 'offline') &&
  (value.cancellationRequested === undefined || typeof value.cancellationRequested === 'boolean');
