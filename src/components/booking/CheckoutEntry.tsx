import { lazy, Suspense, useEffect } from 'react';
import type { ComponentProps } from 'react';
import type { CheckoutModal } from './CheckoutModal';
import { useDialogFocus } from '../useDialogFocus';
import { LogoCRCN } from '../LogoCRCN';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { LockKeyhole, LoaderCircle } from 'lucide-react';

const SinglePageCheckout = lazy(() =>
  import('./SinglePageCheckout').then((module) => ({ default: module.SinglePageCheckout })),
);
type CheckoutEntryProps = ComponentProps<typeof CheckoutModal>;

/** Keep the purchase on our checkout; server readiness controls payment availability. */
export function CheckoutEntry({ isOpen, bookingData, onClose, guestPrefill }: CheckoutEntryProps) {
  const close = () => {
    onClose();
    // A prepared order already has a safe recovery URL. Let the app render its status page.
    if (/^\/checkout\/[A-Za-z0-9]{40}$/.test(window.location.pathname)) {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
  const dialogRef = useDialogFocus(isOpen, close);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

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
        <SinglePageCheckout bookingData={bookingData} onClose={close} guestPrefill={guestPrefill} />
      </Suspense>
    </div>
  );
}
