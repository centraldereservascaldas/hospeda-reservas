import type { Property, Reservation } from '../types';
import type { CalculatedPriceResponse } from '../services/crcnBackendApi';
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

export const isCheckoutQuoteUpdate = (
  value: unknown,
): value is {
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
  breakdown?: {
    dailyRateText: string;
    cleaningFeeText: string;
    serviceFeeText: string;
    totalText: string;
  };
} =>
  isRecord(value) &&
  typeof value.listingId === 'string' &&
  value.listingId.trim() !== '' &&
  (value.staysListingId === undefined || typeof value.staysListingId === 'string') &&
  isPositiveNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  isNonNegativeNumber(value.dailyRate) &&
  isNonNegativeNumber(value.baseTotal) &&
  isNonNegativeNumber(value.cleaningFee) &&
  isNonNegativeNumber(value.serviceFee) &&
  isNonNegativeNumber(value.discount) &&
  isNonNegativeNumber(value.total) &&
  typeof value.currency === 'string' &&
  value.currency.trim() !== '' &&
  value.source === 'stays-live' &&
  (value.breakdown === undefined ||
    (isRecord(value.breakdown) &&
      typeof value.breakdown.dailyRateText === 'string' &&
      typeof value.breakdown.cleaningFeeText === 'string' &&
      typeof value.breakdown.serviceFeeText === 'string' &&
      typeof value.breakdown.totalText === 'string'));

export const isSafeStaysCheckoutUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /(^|\.)stays\.(net|com\.br)$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
};

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

const isReview = (value: unknown): value is Property['reviews'][number] => {
  if (!isRecord(value) || !isRecord(value.categories)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.authorName === 'string' &&
    isFiniteNumber(value.rating) &&
    typeof value.date === 'string' &&
    typeof value.comment === 'string' &&
    Object.values(value.categories).every((score) => score === undefined || isFiniteNumber(score))
  );
};

const isCalculatedPrice = (value: unknown): value is NonNullable<Property['calculatedPrice']> =>
  isRecord(value) &&
  isFiniteNumber(value.nights) &&
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
    typeof value.title === 'string' &&
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
    isFiniteNumber(value.location.lng) &&
    isNonNegativeNumber(value.pricePerNight) &&
    isNonNegativeNumber(value.cleaningFee) &&
    isNonNegativeNumber(value.serviceFeeRate) &&
    isFiniteNumber(value.rating) &&
    isNonNegativeNumber(value.reviewCount) &&
    Number.isInteger(value.reviewCount) &&
    typeof value.isSuperhost === 'boolean' &&
    typeof value.isGuestFavorite === 'boolean' &&
    typeof value.instantBook === 'boolean' &&
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
  isFiniteNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  value.nights >= 1 &&
  isReservationGuests(value.guests) &&
  isFiniteNumber(value.pricePerNight) &&
  isFiniteNumber(value.cleaningFee) &&
  isFiniteNumber(value.serviceFee) &&
  isFiniteNumber(value.discount) &&
  isFiniteNumber(value.totalAmount) &&
  (value.paymentMethod === 'pix' ||
    value.paymentMethod === 'credit_card' ||
    value.paymentMethod === 'apple_pay') &&
  (value.status === 'confirmed' || value.status === 'cancelled' || value.status === 'completed') &&
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
  (value.staysSyncStatus === undefined ||
    value.staysSyncStatus === 'synced' ||
    value.staysSyncStatus === 'pending' ||
    value.staysSyncStatus === 'offline');
