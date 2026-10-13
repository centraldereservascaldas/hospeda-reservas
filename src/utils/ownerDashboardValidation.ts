import type { OwnerDashboardData } from '../services/crcnBackendApi';
import { isFiniteNumber, isRecord } from './apiValidation';

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isOwnerProperty = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.staysListingId === 'string' &&
  typeof value.title === 'string' &&
  typeof value.image === 'string' &&
  isFiniteNumber(value.debit) &&
  isFiniteNumber(value.credit);

const isOwnerReservation = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.code === 'string' &&
  typeof value.listingId === 'string' &&
  typeof value.propertyTitle === 'string' &&
  typeof value.propertyImage === 'string' &&
  typeof value.guestName === 'string' &&
  isIsoDate(value.checkIn) &&
  isIsoDate(value.checkOut) &&
  value.checkOut > value.checkIn &&
  (value.status === 'confirmed' ||
    value.status === 'cancelled' ||
    value.status === 'blocked' ||
    value.status === 'other') &&
  isFiniteNumber(value.total) &&
  typeof value.currency === 'string' &&
  isFiniteNumber(value.nights) &&
  Number.isInteger(value.nights) &&
  value.nights >= 1;

export function isOwnerDashboardData(value: unknown): value is OwnerDashboardData {
  return (
    isRecord(value) &&
    isRecord(value.period) &&
    isIsoDate(value.period.from) &&
    isIsoDate(value.period.to) &&
    value.period.to >= value.period.from &&
    typeof value.ownerName === 'string' &&
    isRecord(value.totals) &&
    isFiniteNumber(value.totals.debit) &&
    isFiniteNumber(value.totals.credit) &&
    Array.isArray(value.properties) &&
    value.properties.every(isOwnerProperty) &&
    Array.isArray(value.reservations) &&
    value.reservations.every(isOwnerReservation)
  );
}
