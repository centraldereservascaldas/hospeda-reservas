import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react';
import { checkoutApi } from '../../services/checkoutApi';
import { getCheckoutResumeToken } from '../../utils/checkoutResumeStorage';

interface CieloCheckoutIframeProps {
  reference: string;
  amount: string;
  checkoutUrl: string | null;
  onAttemptStarted: () => void;
}

function getCieloCheckoutIdempotencyKey(reference: string): string {
  const storageKey = `crcn.checkout.cielo.${reference}`;
  try {
    const existingKey = window.sessionStorage.getItem(storageKey);
    if (existingKey && /^[A-Za-z0-9._~-]{16,128}$/.test(existingKey)) return existingKey;
  } catch {
    // Use an in-memory key when browser storage is unavailable.
  }

  const idempotencyKey = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, idempotencyKey);
  } catch {
    // The request can still proceed with the generated key.
  }

  return idempotencyKey;
}

export function CieloCheckoutIframe({
  reference,
  amount,
  checkoutUrl,
  onAttemptStarted,
}: CieloCheckoutIframeProps) {
  const [currentCheckoutUrl, setCurrentCheckoutUrl] = useState(checkoutUrl);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeStatus, setIframeStatus] = useState<'idle' | 'loading' | 'loaded' | 'fallback'>(
    checkoutUrl ? 'loading' : 'idle',
  );

  useEffect(() => {
    setCurrentCheckoutUrl(checkoutUrl);
  }, [checkoutUrl]);

  useEffect(() => {
    if (!currentCheckoutUrl) {
      setIframeStatus('idle');
      return undefined;
    }

    setIframeStatus('loading');
    const timeoutId = window.setTimeout(() => {
      setIframeStatus((currentStatus) =>
        currentStatus === 'loading' ? 'fallback' : currentStatus,
      );
    }, 7000);

    return () => window.clearTimeout(timeoutId);
  }, [currentCheckoutUrl]);

  const createCheckout = async (): Promise<void> => {
    const resumeToken = getCheckoutResumeToken(reference);
    if (!resumeToken) {
      setError('Não foi possível validar esta sessão. Atualize o pedido antes de continuar.');
      return;
    }

    setIsCreating(true);
    setError(null);
    const idempotencyKey = getCieloCheckoutIdempotencyKey(reference);
    const result = await checkoutApi.createCieloCheckout(
      reference,
      resumeToken,
      amount,
      idempotencyKey,
    );
    setIsCreating(false);

    if (result.kind !== 'response' || !result.success || !result.payment?.checkoutUrl) {
      setError(
        result.kind === 'response'
          ? result.message
          : 'Não foi possível preparar o checkout Cielo. Atualize o pedido e tente novamente.',
      );
      return;
    }

    try {
      window.sessionStorage.removeItem(`crcn.checkout.cielo.${reference}`);
    } catch {
      // A successful attempt can continue if session storage is unavailable.
    }

    setCurrentCheckoutUrl(result.payment.checkoutUrl);
    setIframeStatus('loading');
    onAttemptStarted();
  };

  return (
    <section className="space-y-4" aria-labelledby="cielo-checkout-title">
      <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
        <ShieldCheck className="h-4 w-4 text-orange-700" aria-hidden="true" />
        <h2 id="cielo-checkout-title">Pagamento seguro com cartão</h2>
      </div>

      {error && (
        <p className="text-sm text-rose-800" role="alert">
          {error}
        </p>
      )}

      {currentCheckoutUrl ? (
        <div className="space-y-2">
          <iframe
            src={currentCheckoutUrl}
            title="Checkout seguro da Cielo para pagamento com cartão"
            allow="payment *; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            onLoad={() => setIframeStatus('loaded')}
            className="h-[720px] w-full rounded-2xl border border-neutral-200 bg-white sm:h-[680px]"
          />
          {iframeStatus === 'loading' && (
            <p className="text-sm text-neutral-600" role="status">
              Carregando o checkout seguro da Cielo…
            </p>
          )}
          {iframeStatus === 'fallback' && (
            <p className="text-sm text-amber-900" role="status">
              O checkout pode não ter carregado nesta página. Você pode continuar diretamente no
              ambiente seguro da Cielo pelo link abaixo.
            </p>
          )}
          <a
            href={currentCheckoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 underline underline-offset-2 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Se o checkout não abrir aqui, continue no site seguro da Cielo
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-neutral-700">
            Os dados do cartão serão informados diretamente no ambiente seguro da Cielo. A reserva
            só será confirmada depois que a Cielo validar o pagamento e a estadia for confirmada.
          </p>
          <button
            type="button"
            disabled={isCreating}
            onClick={() => void createCheckout()}
            className="rounded-full bg-orange-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isCreating ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Preparando checkout…
              </span>
            ) : (
              'Continuar para pagamento com cartão'
            )}
          </button>
        </div>
      )}
    </section>
  );
}
