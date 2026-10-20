import type { OwnerDashboardData } from '../services/crcnBackendApi';
import { isFiniteNumber, isIsoDate, isRecord } from './apiValidation';

const getNightsBetween = (checkIn: string, checkOut: string): number =>
  (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;

const isOwnerProperty = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.staysListingId === 'string' &&
  typeof value.title === 'string' &&
  typeof value.image === 'string' &&
  isFiniteNumber(value.debit) &&
  isFiniteNumber(value.credit);

const isOwnerFinancialEntry = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isIsoDate(value.date) &&
  typeof value.listingId === 'string' &&
  typeof value.propertyTitle === 'string' &&
  (value.reservationId === null || typeof value.reservationId === 'string') &&
  (value.reservationCode === null || typeof value.reservationCode === 'string') &&
  typeof value.description === 'string' &&
  (value.publicNote === null || typeof value.publicNote === 'string') &&
  (value.type === 'debit' || value.type === 'credit') &&
  typeof value.status === 'string' &&
  isFiniteNumber(value.amount) &&
  value.amount >= 0;

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
  value.nights === getNightsBetween(value.checkIn, value.checkOut) &&
  (value.paymentStatus === 'paid' ||
    value.paymentStatus === 'partial' ||
    value.paymentStatus === 'unpaid' ||
    value.paymentStatus === 'unknown') &&
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
    Array.isArray(value.entries) &&
    value.entries.every(isOwnerFinancialEntry) &&
    Array.isArray(value.reservations) &&
    value.reservations.every(isOwnerReservation)
  );
}
