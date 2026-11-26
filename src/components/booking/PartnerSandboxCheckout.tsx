import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { partnerSandboxCheckoutApi } from '../../services/partnerSandboxCheckoutApi';
import { LogoCRCN } from '../LogoCRCN';
import { loadCieloSopSdk } from '../../services/cieloSopSdk';
import {
  formatCardExpiration,
  formatCardNumber,
  isValidCardNumber,
} from '../../utils/checkoutInputFormatting';

function statusMessage(status: unknown): string {
  switch (status) {
    case 'quoted':
      return 'Pedido de teste criado; pagamento ainda não iniciado.';
    case 'payment_starting':
      return 'Iniciando o pagamento de teste. Aguarde a conferência.';
    case 'payment_pending':
      return 'Aguardando confirmação do pagamento de teste.';
    case 'payment_verified':
    case 'reservation_starting':
      return 'Pagamento de teste confirmado; conferindo a pré-reserva.';
    case 'awaiting_seller_payment':
      return 'Pré-reserva criada; aguardando pagamento manual à ImobSys pela equipe.';
    case 'payment_rejected':
      return 'Pagamento de teste recusado.';
    case 'quote_unavailable':
      return 'A cotação mudou ou não pôde ser consultada. Nenhum pagamento foi iniciado.';
    case 'payment_cancelled':
      return 'Pagamento de teste cancelado.';
    case 'attention_required':
      return 'Pedido precisa de conferência pela equipe antes de qualquer nova tentativa.';
    default:
      return 'Situação em conferência.';
  }
}

/** Internal development screen; card input is a sandbox token, never card data. */
export function PartnerSandboxCheckout() {
  const params = new URLSearchParams(window.location.search);
  // Keep orders tied to the exact selected stay; never resume a different property or period.
  const storageKey = `partner-sandbox-reference:${JSON.stringify(
    ['propertyId', 'from', 'to', 'guests'].map((name) => params.get(name) ?? ''),
  )}`;
  const [reference, setReference] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const initialReference = useRef(reference);
  const [message, setMessage] = useState('');
  const [pix, setPix] = useState('');
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [busy, setBusy] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentCents, setPaymentCents] = useState<number | null>(null);
  const [installments, setInstallments] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const savedReference = initialReference.current;
    if (!savedReference) return;
    let active = true;
    void partnerSandboxCheckoutApi
      .status(savedReference)
      .then((result) => {
        if (!active) return;
        setOrderStatus(typeof result.status === 'string' ? result.status : '');
        setMethod(result.method === 'card' ? 'card' : 'pix');
        setInstallments(typeof result.installments === 'number' ? result.installments : null);
        setPaymentCents(typeof result.paymentCents === 'number' ? result.paymentCents : null);
        setPix(typeof result.pix === 'string' ? result.pix : '');
        setMessage(statusMessage(result.status));
      })
      .catch(() => {
        if (active) setMessage('Não foi possível recuperar o pedido de teste.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const submissionKey =
        sessionStorage.getItem(`${storageKey}:submission`) ?? crypto.randomUUID();
      sessionStorage.setItem(`${storageKey}:submission`, submissionKey);
      const order = await partnerSandboxCheckoutApi.create(
        {
          propertyId: String(data.get('propertyId')),
          from: String(data.get('from')),
          to: String(data.get('to')),
          guests: Number(data.get('guests')),
          acceptedBaseCents: Number(data.get('baseCents')),
          method,
          ...(method === 'card' ? { installments: Number(data.get('installments')) } : {}),
          customer: {
            fullName: String(data.get('fullName')),
            cpf: String(data.get('cpf')),
            phone: String(data.get('phone')),
          },
        },
        submissionKey,
      );
      if (typeof order.reference !== 'string') throw new Error('Pedido precisa de conferência.');
      sessionStorage.setItem(storageKey, order.reference);
      setReference(order.reference);
      setOrderStatus(typeof order.status === 'string' ? order.status : '');
      setInstallments(method === 'card' ? Number(data.get('installments')) : null);
      setPaymentCents(typeof order.paymentCents === 'number' ? order.paymentCents : null);
      if (order.status === 'quoted') {
        setMessage('Confira o valor de teste antes de iniciar o pagamento.');
      } else {
        const current = await partnerSandboxCheckoutApi.status(order.reference);
        setOrderStatus(typeof current.status === 'string' ? current.status : '');
        setPix(typeof current.pix === 'string' ? current.pix : '');
        setMessage(statusMessage(current.status));
      }
    } catch {
      const savedReference = sessionStorage.getItem(storageKey);
      if (savedReference) {
        try {
          const result = await partnerSandboxCheckoutApi.status(savedReference);
          setOrderStatus(typeof result.status === 'string' ? result.status : '');
          setMessage(statusMessage(result.status));
        } catch {
          setMessage('Não foi possível consultar o pedido. Confira antes de tentar novamente.');
        }
      } else {
        setMessage('Não foi possível criar o pedido de teste. Confira os dados e a cotação.');
      }
    } finally {
      setBusy(false);
    }
  }
  async function confirmPayment() {
    if (!reference || busy || paymentCents === null) return;
    setBusy(true);
    try {
      let paymentToken: string | undefined;
      if (method === 'card') {
        const card = cardRef.current?.querySelector<HTMLInputElement>('.bp-sop-cardnumber');
        const expiration = cardRef.current?.querySelector<HTMLInputElement>(
          '.bp-sop-cardexpirationdate',
        );
        const cvv = cardRef.current?.querySelector<HTMLInputElement>('.bp-sop-cardcvv');
        const holder = cardRef.current?.querySelector<HTMLInputElement>('.bp-sop-cardholdername');
        const digits = expiration?.value.replace(/\D/g, '') ?? '';
        if (
          !card ||
          !expiration ||
          !cvv ||
          !holder ||
          !isValidCardNumber(card.value.replace(/\D/g, '')) ||
          !/^(0[1-9]|1[0-2])\d{2}$/.test(digits) ||
          !/^\d{3,4}$/.test(cvv.value) ||
          holder.value.trim().length < 2
        ) {
          setMessage('Confira os dados do cartão de teste.');
          return;
        }
        const token = await partnerSandboxCheckoutApi.cardToken(reference);
        if (
          token.environment !== 'sandbox' ||
          typeof token.accessToken !== 'string' ||
          !token.accessToken
        )
          throw new Error('Token indisponível');
        await loadCieloSopSdk('sandbox');
        if (!window.bpSop_silentOrderPost) throw new Error('Cielo indisponível');
        const displayedCard = card.value;
        const displayedExpiration = expiration.value;
        card.value = displayedCard.replace(/\D/g, '');
        expiration.value = `${digits.slice(0, 2)}/20${digits.slice(2)}`;
        try {
          paymentToken = await new Promise<string>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Tempo esgotado')), 30000);
            window.bpSop_silentOrderPost!({
              accessToken: token.accessToken as string,
              environment: 'sandbox',
              language: 'pt',
              enableTokenize: false,
              onSuccess: (response) => {
                window.clearTimeout(timer);
                if (
                  typeof response.PaymentToken === 'string' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    response.PaymentToken,
                  )
                )
                  resolve(response.PaymentToken);
                else reject(new Error('Token inválido'));
              },
              onError: () => {
                window.clearTimeout(timer);
                reject(new Error('Cartão recusado'));
              },
              onInvalid: () => {
                window.clearTimeout(timer);
                reject(new Error('Dados inválidos'));
              },
            });
          });
        } finally {
          card.value = displayedCard;
          expiration.value = displayedExpiration;
          cvv.value = '';
        }
      }
      const payment = await partnerSandboxCheckoutApi.startPayment(reference, paymentToken);
      setPix(typeof payment.pix === 'string' ? payment.pix : '');
      setOrderStatus('payment_pending');
      setMessage('Pagamento de teste iniciado. Consulte a situação abaixo.');
    } catch {
      try {
        const result = await partnerSandboxCheckoutApi.status(reference);
        setOrderStatus(typeof result.status === 'string' ? result.status : '');
        setMessage(statusMessage(result.status));
      } catch {
        setMessage('Não foi possível consultar o pedido. Confira antes de tentar novamente.');
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      await partnerSandboxCheckoutApi.reconcile(reference);
      const result = await partnerSandboxCheckoutApi.status(reference);
      setOrderStatus(typeof result.status === 'string' ? result.status : '');
      setPix(typeof result.pix === 'string' ? result.pix : '');
      setMessage(statusMessage(result.status));
    } catch {
      setMessage('Não foi possível atualizar. Consulte novamente antes de repetir o pagamento.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#f7f4ee] p-6 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white bg-white/90 p-6 shadow-xl">
        <LogoCRCN size="sm" variant="glass" />
        <h1 className="mt-6 text-2xl font-bold">Checkout de teste</h1>
        <p className="mt-2 text-sm">Sandbox: use somente dados de teste.</p>
        {!reference ? (
          <form onSubmit={submit} className="mt-6 grid gap-3">
            {[
              ['propertyId', 'Imóvel'],
              ['from', 'Entrada'],
              ['to', 'Saída'],
              ['guests', 'Hóspedes'],
              ['baseCents', 'Valor em centavos'],
              ['fullName', 'Nome'],
              ['cpf', 'CPF'],
              ['phone', 'Telefone'],
            ].map(([name, label]) => (
              <label key={name} className="grid gap-1 text-sm font-medium">
                {label}
                <input
                  className="rounded-xl border p-3"
                  name={name}
                  required
                  defaultValue={params.get(name) ?? ''}
                  type={
                    name === 'from' || name === 'to'
                      ? 'date'
                      : name === 'guests' || name === 'baseCents'
                        ? 'number'
                        : 'text'
                  }
                />
              </label>
            ))}
            <label>
              Método{' '}
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as 'pix' | 'card')}
                className="rounded-xl border p-3"
              >
                <option value="pix">Pix</option>
                <option value="card">Cartão de teste</option>
              </select>
            </label>
            {method === 'card' && (
              <>
                <label>
                  Parcelas{' '}
                  <input
                    name="installments"
                    type="number"
                    min="1"
                    max="6"
                    defaultValue="1"
                    required
                    className="rounded-xl border p-3"
                  />
                </label>
              </>
            )}
            <button disabled={busy} className="rounded-xl bg-orange-700 p-3 font-bold text-white">
              Conferir valor
            </button>
          </form>
        ) : (
          <div className="mt-5 grid gap-3">
            {orderStatus === 'quoted' && paymentCents !== null && (
              <>
                <p>
                  Valor total do pagamento de teste:{' '}
                  <strong>
                    {(paymentCents / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </p>
                {method === 'card' && installments !== null && installments > 1 && (
                  <p>
                    {installments} parcelas de até{' '}
                    {(Math.ceil(paymentCents / installments) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </p>
                )}
                {method === 'card' && (
                  <div ref={cardRef} className="grid gap-3">
                    <label>
                      Número do cartão de teste
                      <input
                        autoComplete="cc-number"
                        inputMode="numeric"
                        onChange={(event) => {
                          event.currentTarget.value = formatCardNumber(event.currentTarget.value);
                        }}
                        className="bp-sop-cardnumber block w-full rounded-xl border p-3"
                      />
                    </label>
                    <label>
                      Validade
                      <input
                        autoComplete="cc-exp"
                        placeholder="MM/AA"
                        maxLength={5}
                        onChange={(event) => {
                          event.currentTarget.value = formatCardExpiration(
                            event.currentTarget.value,
                          );
                        }}
                        className="bp-sop-cardexpirationdate block w-full rounded-xl border p-3"
                      />
                    </label>
                    <label>
                      Código de segurança
                      <input
                        autoComplete="cc-csc"
                        inputMode="numeric"
                        maxLength={4}
                        className="bp-sop-cardcvv bp-sop-cardcvvc block w-full rounded-xl border p-3"
                      />
                    </label>
                    <label>
                      Nome no cartão
                      <input
                        autoComplete="cc-name"
                        className="bp-sop-cardholdername block w-full rounded-xl border p-3"
                      />
                    </label>
                  </div>
                )}
                <button
                  disabled={busy}
                  onClick={() => void confirmPayment()}
                  className="rounded-xl bg-orange-700 p-3 font-bold text-white"
                >
                  Confirmar pagamento de teste
                </button>
              </>
            )}
            {pix && (
              <textarea
                aria-label="Pix de teste"
                readOnly
                value={pix}
                className="rounded-xl border p-3"
              />
            )}
            <button
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-xl bg-orange-700 p-3 font-bold text-white"
            >
              Atualizar situação
            </button>
            {orderStatus === 'quote_unavailable' && (
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(storageKey);
                  sessionStorage.removeItem(`${storageKey}:submission`);
                  window.location.assign('/');
                }}
                className="rounded-xl border border-neutral-300 p-3 font-bold"
              >
                Voltar à busca
              </button>
            )}
          </div>
        )}
        <p role="status" className="mt-4">
          {message}
        </p>
      </div>
    </main>
  );
}
