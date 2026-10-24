import type { DirectBookingOrderSummary } from '../services/crcnBackendApi';
import { readMeasurementConsent } from './measurementConsent';

type FunnelEvent =
  | { event: 'search'; has_dates: boolean; guests: number }
  | { event: 'view_item'; items: [{ item_id: string }] }
  | { event: 'begin_checkout'; items: [{ item_id: string }] }
  | { event: 'add_payment_info'; payment_type: 'pix' | 'card' }
  | {
      event: 'purchase';
      transaction_id: string;
      currency: 'BRL';
      value: number;
      items: [{ item_id: string }];
    };

const emittedPurchases = new Set<string>();
const pendingPurchases = new Set<string>();
const PURCHASE_STORAGE_PREFIX = 'crcn.purchaseEmitted.v1.';

export function emitFunnelEvent(event: FunnelEvent): boolean {
  if ('items' in event && !/^[A-Za-z0-9_-]+$/.test(event.items[0]?.item_id ?? '')) return false;
  if (event.event === 'search' && (!Number.isInteger(event.guests) || event.guests < 1 || event.guests > 30)) return false;
  const consent = readMeasurementConsent();
  if (!consent?.analytics || !consent.advertising) return false;
  if (!document.getElementById('crcn-gtm-script')) return false;
  const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
  if (!dataLayer) return false;
  dataLayer.push(event);
  return true;
}

export async function emitConfirmedPurchase(order: DirectBookingOrderSummary): Promise<boolean> {
  if (
    !['confirmado', 'concluido'].includes(order.status) ||
    !order.reservationConfirmed ||
    order.paymentStatus !== 'approved' ||
    order.currency !== 'BRL' ||
    !/^[A-Za-z0-9]{40}$/.test(order.publicReference) ||
    !/^[A-Za-z0-9_-]+$/.test(order.listingId) ||
    !/^\d+(?:\.\d{1,2})?$/.test(order.quoteTotal)
  ) {
    return false;
  }

  const value = Number(order.quoteTotal);
  if (!Number.isFinite(value) || value <= 0) return false;
  const key = `${PURCHASE_STORAGE_PREFIX}${order.publicReference}`;
  if (emittedPurchases.has(key) || pendingPurchases.has(key)) return false;
  try {
    if (window.localStorage.getItem(key) === '1') return false;
  } catch {
    // The in-memory set still prevents repeat emission in this page.
  }

  pendingPurchases.add(key);
  try {
    if (!globalThis.crypto?.subtle) return false;
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`crcn-purchase-v1:${order.publicReference}`),
    );
    const transactionId = `crcn_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const emitted = emitFunnelEvent({
      event: 'purchase',
      transaction_id: transactionId,
      currency: 'BRL',
      value,
      items: [{ item_id: order.listingId }],
    });
    if (!emitted) return false;
    emittedPurchases.add(key);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // The event was emitted and is still deduplicated for this page.
    }
    return true;
  } catch {
    return false;
  } finally {
    pendingPurchases.delete(key);
  }
}
