import type { Property } from '../types';
import type { StaysCalendarDay } from './staysAvailability';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isHighlight = (value: unknown): value is Property['highlights'][number] =>
  isRecord(value) && typeof value.icon === 'string' &&
  typeof value.title === 'string' && typeof value.description === 'string';

const isSleepingArrangement = (value: unknown): value is Property['sleepingArrangements'][number] =>
  isRecord(value) && typeof value.roomName === 'string' &&
  typeof value.bedType === 'string' && typeof value.icon === 'string';

const isReview = (value: unknown): value is Property['reviews'][number] => {
  if (!isRecord(value) || !isRecord(value.categories)) return false;
  return typeof value.id === 'string' && typeof value.authorName === 'string' &&
    isFiniteNumber(value.rating) && typeof value.date === 'string' &&
    typeof value.comment === 'string' &&
    Object.values(value.categories).every((score) => score === undefined || isFiniteNumber(score));
};

const isCalculatedPrice = (value: unknown): value is NonNullable<Property['calculatedPrice']> =>
  isRecord(value) && isFiniteNumber(value.nights) && isFiniteNumber(value.dailyRate) &&
  isFiniteNumber(value.basePrice) && isFiniteNumber(value.cleaningFee) &&
  isFiniteNumber(value.serviceFee) && isFiniteNumber(value.totalAmount) &&
  typeof value.currency === 'string' &&
  (value.fees === undefined || Array.isArray(value.fees));

export const isProperty = (value: unknown): value is Property => {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.host)) return false;
  const propertyType = value.propertyType;
  const calendarIsValid = value.calendar === undefined || (Array.isArray(value.calendar) && value.calendar.every((day) =>
    isRecord(day) && typeof day.date === 'string' && isFiniteNumber(day.avail) &&
    (day.price === undefined || isFiniteNumber(day.price)) &&
    (day.minStay === undefined || isFiniteNumber(day.minStay)) &&
    (day.closedToArrival === undefined || typeof day.closedToArrival === 'boolean') &&
    (day.closedToDeparture === undefined || typeof day.closedToDeparture === 'boolean')));
  return typeof value.id === 'string' && typeof value.title === 'string' &&
    typeof value.subtitle === 'string' && typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    (propertyType === 'entire_place' || propertyType === 'private_room' || propertyType === 'cabin' || propertyType === 'villa') &&
    typeof value.location.city === 'string' && typeof value.location.state === 'string' &&
    typeof value.location.country === 'string' && typeof value.location.neighborhood === 'string' &&
    typeof value.location.address === 'string' && isFiniteNumber(value.location.lat) &&
    isFiniteNumber(value.location.lng) && isFiniteNumber(value.pricePerNight) &&
    isFiniteNumber(value.cleaningFee) && isFiniteNumber(value.serviceFeeRate) &&
    isFiniteNumber(value.rating) && isFiniteNumber(value.reviewCount) &&
    typeof value.isSuperhost === 'boolean' && typeof value.isGuestFavorite === 'boolean' &&
    typeof value.instantBook === 'boolean' && isStringArray(value.images) &&
    isFiniteNumber(value.bedrooms) && isFiniteNumber(value.beds) &&
    isFiniteNumber(value.bathrooms) && isFiniteNumber(value.maxGuests) &&
    isStringArray(value.amenities) && Array.isArray(value.highlights) && value.highlights.every(isHighlight) &&
    Array.isArray(value.sleepingArrangements) && value.sleepingArrangements.every(isSleepingArrangement) &&
    isStringArray(value.rules) && Array.isArray(value.reviews) && value.reviews.every(isReview) &&
    typeof value.host.name === 'string' && typeof value.host.avatar === 'string' &&
    isFiniteNumber(value.host.joinedYear) && typeof value.host.isSuperhost === 'boolean' &&
    typeof value.host.responseTime === 'string' && typeof value.host.responseRate === 'string' &&
    typeof value.host.bio === 'string' && calendarIsValid &&
    (value.calculatedPrice === undefined || isCalculatedPrice(value.calculatedPrice)) &&
    (value.complexImages === undefined || isStringArray(value.complexImages)) &&
    (value.listingAmenities === undefined || isStringArray(value.listingAmenities)) &&
    (value.propertyAmenities === undefined || isStringArray(value.propertyAmenities)) &&
    (value.staysPropertyId === undefined || typeof value.staysPropertyId === 'string') &&
    (value.staysListingId === undefined || typeof value.staysListingId === 'string') &&
    (value.staysListingObjectId === undefined || typeof value.staysListingObjectId === 'string');
};

const isStaysCalendarPrice = (price: unknown): boolean =>
  isRecord(price) && (price.minStay === undefined || isFiniteNumber(price.minStay)) &&
  (price._mcval === undefined || (isRecord(price._mcval) && Object.values(price._mcval).every(isFiniteNumber)));

export const isStaysCalendarDay = (value: unknown): value is StaysCalendarDay =>
  isRecord(value) && typeof value.date === 'string' && isFiniteNumber(value.avail) &&
  (value.closedToArrival === undefined || typeof value.closedToArrival === 'boolean') &&
  (value.closedToDeparture === undefined || typeof value.closedToDeparture === 'boolean') &&
  (value.prices === undefined || (Array.isArray(value.prices) && value.prices.every(isStaysCalendarPrice)));
