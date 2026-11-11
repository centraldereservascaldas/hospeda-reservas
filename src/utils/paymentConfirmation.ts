import type { DirectBookingOrderSummary } from '../services/checkoutApi';
import { checkoutPathWithStayQuery } from './checkoutUrl';

/** The URL is navigation only; payment status is always checked from the server. */
export function navigateToPaymentConfirmation(order: DirectBookingOrderSummary): boolean {
  if (order.paymentStatus !== 'approved' || !/^[A-Za-z0-9]{40}$/.test(order.publicReference))
    return false;
  const path = `/checkout/${order.publicReference}/pagamento-confirmado`;
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', checkoutPathWithStayQuery(path, window.location.search));
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return true;
}

/** Only an authoritative rejection reaches the rejection URL; uncertain outcomes remain pending. */
export function navigateToPaymentRejection(order: DirectBookingOrderSummary): boolean {
  if (order.status !== 'pagamento_recusado' || !/^[A-Za-z0-9]{40}$/.test(order.publicReference))
    return false;
  const path = `/checkout/${order.publicReference}/pagamento-recusado`;
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', checkoutPathWithStayQuery(path, window.location.search));
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return true;
}
