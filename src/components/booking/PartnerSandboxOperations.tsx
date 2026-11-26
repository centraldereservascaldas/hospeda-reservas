import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { useSupabaseSession } from '../../hooks/useSupabaseSession';

interface Order {
  id: string;
  supplier_property_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  base_cents: number;
  supplier_payable_observed_cents: number | null;
  status: string;
  attention_reason: string | null;
  reservation_reference: string | null;
  supplier_operation_id: string | null;
}

const currency = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function stayDate(value: string): string {
  const iso = value.slice(0, 10);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : iso;
}

function attentionMessage(order: Order): string {
  if (order.status === 'reservation_starting')
    return 'Pagamento confirmado; pré-reserva em processamento. Confira o fornecedor antes de repetir.';
  switch (order.attention_reason) {
    case 'payment_outcome_unknown':
      return 'Resultado do pagamento ainda não confirmado. Consulte a Cielo antes de qualquer nova cobrança.';
    case 'payment_mismatch':
      return 'Dados do pagamento divergem do pedido. Confira a Cielo antes de continuar.';
    case 'supplier_outcome_unknown':
      return 'Pagamento confirmado; pré-reserva sem resultado confirmado. Confira a ImobSys e trate o pagamento com a equipe antes de repetir.';
    default:
      return 'Resultado pendente de análise. Confira o pagamento e a reserva antes de continuar.';
  }
}

/** Internal sandbox only; the server independently enforces admin authorization. */
export function PartnerSandboxOperations() {
  const { accountSession } = useSupabaseSession({
    isConfigured: Boolean(
      import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
    ),
    initialHash: window.location.hash,
    initialAuthCallbackError: '',
  });
  const token = accountSession?.access_token;
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [supplierStatus, setSupplierStatus] = useState<Record<string, string>>({});
  const load = useCallback(
    async (requestedPage = 1) => {
      if (!token) return;
      try {
        const response = await apiFetch(
          `/api/owner/admin/partner-sandbox/orders?page=${requestedPage}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          },
        );
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.orders)) throw new Error();
        setOrders(result.orders);
        setPage(requestedPage);
        setNextPage(typeof result.nextPage === 'number' ? result.nextPage : null);
        setMessage('');
      } catch {
        setMessage('Não foi possível carregar os pedidos. Confira o acesso da conta.');
      }
    },
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function record(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    if (!token || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(String(data.get('amount')).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Informe um valor válido.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/owner/admin/partner-sandbox/orders/${encodeURIComponent(order.id)}/manual-payment`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents: Math.round(amount * 100),
            reference: String(data.get('reference') || ''),
          }),
        },
      );
      if (!response.ok) throw new Error();
      await load();
      setMessage('Pagamento ao fornecedor registrado no teste.');
    } catch {
      setMessage(
        'Não foi possível registrar. Atualize a fila e confira o pedido antes de tentar novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function consultSupplier(order: Order) {
    if (!token || busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/owner/admin/partner-sandbox/orders/${encodeURIComponent(order.id)}/supplier-status`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      );
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('state' in result) ||
        typeof result.state !== 'string'
      )
        throw new Error();
      const status =
        'partnerStatus' in result && typeof result.partnerStatus === 'string'
          ? result.partnerStatus
          : 'unknown';
      const ref =
        'reservationReference' in result && typeof result.reservationReference === 'string'
          ? result.reservationReference
          : 'não identificada';
      const stateLabel: Record<string, string> = {
        starting: 'em processamento',
        created: 'registrada',
        unknown: 'incerta',
        rejected: 'recusada',
      };
      const partnerLabel: Record<string, string> = {
        confirmed: 'confirmada',
        cancelled: 'cancelada',
        unknown: 'não identificada',
      };
      const state = result.state;
      setSupplierStatus((current) => ({
        ...current,
        [order.id]: `Operação: ${stateLabel[state] ?? 'desconhecida'}; situação no fornecedor: ${partnerLabel[status] ?? 'não identificada'}; referência: ${ref}. Confira imóvel e datas na ImobSys.`,
      }));
    } catch {
      setSupplierStatus((current) => ({
        ...current,
        [order.id]: 'Consulta indisponível. Mantenha a conferência manual e não repita a reserva.',
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 text-slate-900">
      <h1 className="text-2xl font-bold">Pedidos de parceiros — teste</h1>
      <p className="mt-2 text-sm">Fila interna de sandbox. Nenhum pagamento é feito nesta tela.</p>
      {!token ? (
        <p className="mt-6">Entre com uma conta administradora no site para consultar a fila.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void load()}
            className="my-5 rounded-xl border px-4 py-2"
          >
            Atualizar fila
          </button>
          {orders.length === 0 && !message && <p>Nenhum pedido aguardando atendimento.</p>}
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="font-bold">Imóvel {order.supplier_property_id}</h2>
                <p>
                  {stayDate(order.check_in)} até {stayDate(order.check_out)} · {order.guests}{' '}
                  hóspedes
                </p>
                <p>Valor da hospedagem: {currency(order.base_cents)}</p>
                {order.attention_reason === 'supplier_outcome_unknown' && (
                  <div>
                    {order.reservation_reference && (
                      <p>Referência recebida para conferência: {order.reservation_reference}</p>
                    )}
                    {order.supplier_operation_id && (
                      <p>Identificador de conferência: {order.supplier_operation_id}</p>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void consultSupplier(order)}
                      className="mt-2 rounded-xl border px-4 py-2"
                    >
                      Consultar operação
                    </button>
                    {supplierStatus[order.id] && <p role="status">{supplierStatus[order.id]}</p>}
                  </div>
                )}
                {order.status === 'awaiting_seller_payment' ? (
                  <>
                    <p>
                      Pré-reserva: {order.reservation_reference} · aguardando pagamento ao
                      fornecedor
                    </p>
                    <p>
                      Valor observado para pagar:{' '}
                      {typeof order.supplier_payable_observed_cents === 'number'
                        ? currency(order.supplier_payable_observed_cents)
                        : 'não informado'}
                      . Confirme na ImobSys.
                    </p>
                    <form
                      onSubmit={(event) => void record(event, order)}
                      className="mt-4 grid gap-2 sm:grid-cols-3"
                    >
                      <label>
                        Valor pago (R$)
                        <input
                          name="amount"
                          inputMode="decimal"
                          required
                          className="block w-full rounded border p-2"
                        />
                      </label>
                      <label>
                        Referência do pagamento
                        <input
                          name="reference"
                          maxLength={100}
                          required
                          className="block w-full rounded border p-2"
                        />
                      </label>
                      <button
                        disabled={busy}
                        className="self-end rounded bg-orange-700 p-2 font-bold text-white"
                      >
                        Registrar pagamento
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="font-semibold text-amber-800">
                    Precisa de conferência: {attentionMessage(order)}
                  </p>
                )}
              </article>
            ))}
          </div>
          {(page > 1 || nextPage !== null) && (
            <div className="mt-5 flex items-center gap-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => void load(page - 1)}
                className="rounded-xl border px-4 py-2 disabled:opacity-50"
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                type="button"
                disabled={nextPage === null}
                onClick={() => nextPage !== null && void load(nextPage)}
                className="rounded-xl border px-4 py-2 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      <p role="status" className="mt-4">
        {message}
      </p>
    </main>
  );
}
