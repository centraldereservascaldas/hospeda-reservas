import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { StaysCheckoutModal as StaysCheckoutModalType } from './StaysCheckoutModal';
import { checkoutApi } from '../../services/checkoutApi';
import { useDialogFocus } from '../useDialogFocus';

const StaysCheckoutModal = lazy(() =>
  import('./StaysCheckoutModal').then((module) => ({ default: module.StaysCheckoutModal })),
);
const SinglePageCheckout = lazy(() =>
  import('./SinglePageCheckout').then((module) => ({ default: module.SinglePageCheckout })),
);
type CheckoutEntryProps = ComponentProps<typeof StaysCheckoutModalType>;
type Selection = {
  booking: CheckoutEntryProps['bookingData'];
  route: 'loading' | 'direct' | 'stays';
};

/** Server-controlled pilot routing. Errors, old responses and timeouts preserve Stays. */
export function CheckoutEntry({
  isOpen,
  bookingData,
  onClose,
  guestPrefill,
  currency,
}: CheckoutEntryProps) {
  const [selection, setSelection] = useState<Selection>({ booking: null, route: 'loading' });
  const route = selection.booking === bookingData ? selection.route : 'loading';
  const close = () => {
    onClose();
    // A prepared order already has a safe recovery URL. Let the app render its status page.
    if (route === 'direct' && /^\/checkout\/[A-Za-z0-9]{40}$/.test(window.location.pathname)) {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
  const dialogRef = useDialogFocus(isOpen && route !== 'stays', close);

  useEffect(() => {
    if (!isOpen || !bookingData) {
      setSelection({ booking: null, route: 'loading' });
      return;
    }
    let settled = false;
    setSelection({ booking: bookingData, route: 'loading' });
    const select = (next: Selection['route']) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      setSelection({ booking: bookingData, route: next });
    };
    const timeout = window.setTimeout(() => select('stays'), 2500);
    void checkoutApi
      .getCheckoutReadiness(bookingData.property.id)
      .then((result) => {
        const eligible =
          result.kind === 'ready' &&
          result.data.singlePageCheckoutEnabled === true &&
          result.data.ready === true &&
          result.data.payment.enabled &&
          result.data.payment.methods.includes('card') &&
          ['cielo', 'cielo_sandbox'].includes(result.data.payment.provider);
        select(eligible ? 'direct' : 'stays');
      })
      .catch(() => select('stays'));
    return () => {
      settled = true;
      window.clearTimeout(timeout);
    };
  }, [bookingData, isOpen]);

  useEffect(() => {
    if (!isOpen || route === 'stays') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, route]);

  if (!isOpen || !bookingData) return null;
  const loading = (
    <p role="status" className="p-8 text-sm text-neutral-700">
      Preparando sua reserva…
    </p>
  );
  if (route === 'stays')
    return (
      <Suspense fallback={loading}>
        <StaysCheckoutModal
          isOpen
          onClose={onClose}
          bookingData={bookingData}
          guestPrefill={guestPrefill}
          currency={currency}
        />
      </Suspense>
    );
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar reserva"
      tabIndex={-1}
      data-dialog-focus-root
      className="fixed inset-0 z-50 overflow-y-auto bg-white"
    >
      <Suspense fallback={loading}>
        {route === 'direct' ? (
          <SinglePageCheckout
            bookingData={bookingData}
            onClose={close}
            guestPrefill={guestPrefill}
          />
        ) : (
          <div>
            {loading}
            <button
              type="button"
              onClick={onClose}
              className="mx-8 min-h-11 rounded-xl border border-neutral-300 px-4 text-sm"
            >
              Voltar para acomodação
            </button>
          </div>
        )}
      </Suspense>
    </div>
  );
}
