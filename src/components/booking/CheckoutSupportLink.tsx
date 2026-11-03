import { MessageCircle } from 'lucide-react';
import { getCheckoutSupportUrl, type CheckoutSupportDetails } from '../../utils/checkoutSupport';

export function CheckoutSupportLink({ details }: { details: CheckoutSupportDetails }) {
  return (
    <a
      href={getCheckoutSupportUrl(details)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
    >
      <MessageCircle size={18} aria-hidden="true" /> Falar no WhatsApp
      <span className="sr-only"> (abre em nova aba com os detalhes da reserva)</span>
    </a>
  );
}
