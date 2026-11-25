import type { AppOverlayBookingPayload } from '../types/booking';

const KEY = 'crcn.checkout.draft.v1.';
export const CHECKOUT_DRAFT_HISTORY_KEY = '__crcnCheckoutDraftId';
export const NEW_CHECKOUT_PATH = '/checkout';
export const LEGACY_NEW_CHECKOUT_PATH = '/checkout/nova';
export function isNewCheckoutPath(path: string): boolean {
  return path === NEW_CHECKOUT_PATH || path === LEGACY_NEW_CHECKOUT_PATH;
}
export type CheckoutDraft = Pick<AppOverlayBookingPayload, 'checkIn' | 'checkOut' | 'guests'> & {
  propertyId: string;
};

export function saveCheckoutDraft(payload: AppOverlayBookingPayload): string {
  const draft: CheckoutDraft = {
    propertyId: payload.property.id,
    checkIn: payload.checkIn,
    checkOut: payload.checkOut,
    guests: payload.guests,
  };
  try {
    const id = window.crypto.randomUUID();
    window.sessionStorage.setItem(KEY + id, JSON.stringify(draft));
    return id;
  } catch {
    return ''; // The current checkout remains usable.
  }
}

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const id: unknown = window.history.state?.[CHECKOUT_DRAFT_HISTORY_KEY];
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return null;
    const value: unknown = JSON.parse(window.sessionStorage.getItem(KEY + id) || 'null');
    if (!value || typeof value !== 'object') return null;
    const d = value as CheckoutDraft;
    const date = (s: unknown) =>
      typeof s === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
      new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
    if (
      typeof d.propertyId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(d.propertyId) ||
      !date(d.checkIn) ||
      !date(d.checkOut) ||
      d.checkOut <= d.checkIn ||
      !d.guests ||
      typeof d.guests !== 'object'
    )
      return null;
    if (
      !(['adults', 'children', 'infants', 'pets'] as const).every(
        (key) => Number.isInteger(d.guests[key]) && d.guests[key] >= 0 && d.guests[key] <= 50,
      ) ||
      d.guests.adults < 1
    )
      return null;
    return {
      propertyId: d.propertyId,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      guests: {
        adults: d.guests.adults,
        children: d.guests.children,
        infants: d.guests.infants,
        pets: d.guests.pets,
      },
    };
  } catch {
    return null;
  }
}

export type CheckoutContact = { fullName: string; email: string; phone: string };

function contactKey(): string | null {
  const id: unknown = window.history.state?.[CHECKOUT_DRAFT_HISTORY_KEY];
  return isNewCheckoutPath(window.location.pathname) &&
    typeof id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(id)
    ? `${KEY}${id}.contact`
    : null;
}

export function readCheckoutContact(): CheckoutContact | null {
  try {
    const key = contactKey();
    if (!key) return null;
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    if (!value || typeof value !== 'object') return null;
    const contact = value as Record<string, unknown>;
    if (
      typeof contact.fullName !== 'string' ||
      typeof contact.email !== 'string' ||
      typeof contact.phone !== 'string' ||
      contact.fullName.length > 200 ||
      contact.email.length > 254 ||
      contact.phone.length > 20
    )
      return null;
    return { fullName: contact.fullName, email: contact.email, phone: contact.phone };
  } catch {
    return null;
  }
}

export function saveCheckoutContact(contact: CheckoutContact): void {
  try {
    const key = contactKey();
    if (key)
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          fullName: contact.fullName.slice(0, 200),
          email: contact.email.slice(0, 254),
          phone: contact.phone.slice(0, 20),
        }),
      );
  } catch {
    /* The form remains usable if storage is unavailable. */
  }
}

export function clearCheckoutContact(): void {
  try {
    const key = contactKey();
    if (key) window.sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
