import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { StaysCheckoutModal as StaysCheckoutModalType } from './StaysCheckoutModal';
import { checkoutApi } from '../../services/checkoutApi';
import { useDialogFocus } from '../useDialogFocus';
import { LogoCRCN } from '../LogoCRCN';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { LockKeyhole, LoaderCircle } from 'lucide-react';

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

/** Server-controlled checkout routing; errors and timeouts preserve the hosted fallback. */
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
    const timeout = window.setTimeout(() => select('stays'), 4000);
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
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/50 px-4 py-8 backdrop-blur-sm"
    >
      <div className="liquid-glass-card w-full max-w-md overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-4">
          <LogoCRCN size="sm" variant="glass" />
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-600">
            <LockKeyhole size={14} aria-hidden="true" />
            <span className="hidden min-[380px]:inline">Seguro</span>
          </span>
        </div>
        <div className="flex items-center gap-4 px-5 pt-5">
          {bookingData.property.images[0] && (
            <img
              src={bookingData.property.images[0]}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-800">
              Sua hospedagem
            </p>
            <p className="mt-1 line-clamp-2 text-base font-bold leading-snug text-neutral-950">
              {getPublicPropertyTitle(bookingData.property.title)}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              {bookingData.nights} {bookingData.nights === 1 ? 'noite' : 'noites'}
            </p>
          </div>
        </div>
        <div className="px-5 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <LoaderCircle
              size={19}
              className="animate-spin text-orange-700 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <h2 className="text-lg font-bold text-neutral-950">Preparando seu pagamento</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Conferindo disponibilidade e condições da reserva.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 min-h-11 rounded-xl px-2 text-sm font-semibold text-neutral-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            Voltar ao imóvel
          </button>
        </div>
      </div>
    </div>
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
          loading
        )}
      </Suspense>
    </div>
  );
}
