import type { DirectBookingOrderSummary } from '../services/checkoutApi';

/** The URL is navigation only; payment status is always checked from the server. */
export function navigateToPaymentConfirmation(order: DirectBookingOrderSummary): boolean {
  if (order.paymentStatus !== 'approved' || !/^[A-Za-z0-9]{40}$/.test(order.publicReference))
    return false;
  const path = `/checkout/${order.publicReference}/pagamento-confirmado`;
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return true;
}
