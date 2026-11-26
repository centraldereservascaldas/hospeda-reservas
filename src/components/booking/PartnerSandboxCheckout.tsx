import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { partnerSandboxCheckoutApi } from '../../services/partnerSandboxCheckoutApi';
import { LogoCRCN } from '../LogoCRCN';

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
  const [reference, setReference] = useState(
    () => sessionStorage.getItem('partner-sandbox-reference') ?? '',
  );
  const initialReference = useRef(reference);
  const [message, setMessage] = useState('');
  const [pix, setPix] = useState('');
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [busy, setBusy] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentCents, setPaymentCents] = useState<number | null>(null);
  const [paymentToken, setPaymentToken] = useState('');
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
      const order = await partnerSandboxCheckoutApi.create({
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
      });
      if (typeof order.reference !== 'string') throw new Error('Pedido precisa de conferência.');
      sessionStorage.setItem('partner-sandbox-reference', order.reference);
      setReference(order.reference);
      setOrderStatus('quoted');
      setPaymentCents(typeof order.paymentCents === 'number' ? order.paymentCents : null);
      setMessage('Confira o valor de teste antes de iniciar o pagamento.');
    } catch {
      const savedReference = sessionStorage.getItem('partner-sandbox-reference');
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
    if (!reference || busy || paymentCents === null || (method === 'card' && !paymentToken.trim()))
      return;
    setBusy(true);
    try {
      const payment = await partnerSandboxCheckoutApi.startPayment(
        reference,
        method === 'card' ? paymentToken : undefined,
      );
      setPaymentToken('');
      setPix(typeof payment.pix === 'string' ? payment.pix : '');
      setOrderStatus('payment_pending');
      setMessage('Pagamento de teste iniciado. Consulte a situação abaixo.');
    } catch {
      setPaymentToken('');
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
                {method === 'card' && (
                  <label>
                    Token de cartão sandbox
                    <input
                      value={paymentToken}
                      onChange={(event) => setPaymentToken(event.target.value)}
                      className="block w-full rounded-xl border p-3"
                    />
                  </label>
                )}
                <button
                  disabled={busy || (method === 'card' && !paymentToken.trim())}
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
                  sessionStorage.removeItem('partner-sandbox-reference');
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
