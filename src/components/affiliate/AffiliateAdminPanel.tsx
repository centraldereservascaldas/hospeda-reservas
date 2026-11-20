import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiFetch';

type Account = { user_id: string; full_name: string; commission_basis_points?: number };
type Commission = {
  id: number;
  full_name: string;
  listing_id: string;
  booking_status: string;
  payment_status: string | null;
  status: string;
  approved_amount_cents: number | null;
  quote_total: string;
  commission_basis_points: number | null;
};

export function AffiliateAdminPanel({ token }: { token: string }) {
  const [authorized, setAuthorized] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [approvedAccounts, setApprovedAccounts] = useState<Account[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [accountsResponse, commissionsResponse, approvedResponse] = await Promise.all([
        apiFetch('/api/owner/admin/affiliates', { headers }),
        apiFetch('/api/owner/admin/affiliate-commissions', { headers }),
        apiFetch('/api/owner/admin/affiliates/approved', { headers }),
      ]);
      if (accountsResponse.status === 403 || accountsResponse.status === 503) {
        setAuthorized(false);
        return;
      }
      if (!accountsResponse.ok || !commissionsResponse.ok || !approvedResponse.ok)
        throw new Error();
      const [a, c, approved] = await Promise.all([
        accountsResponse.json(),
        commissionsResponse.json(),
        approvedResponse.json(),
      ]);
      setAccounts(Array.isArray(a.accounts) ? a.accounts : []);
      setCommissions(Array.isArray(c.commissions) ? c.commissions : []);
      setApprovedAccounts(Array.isArray(approved.accounts) ? approved.accounts : []);
      setAuthorized(true);
    } catch {
      setMessage('Não foi possível carregar a administração.');
    }
  }, [token]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(path: string, body: object) {
    try {
      const result = await apiFetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        setMessage('Não foi possível aprovar. Confira os dados e o status da reserva.');
        return;
      }
      setMessage('Aprovação registrada.');
      await refresh();
    } catch {
      setMessage('Não foi possível registrar a aprovação.');
    }
  }
  if (!authorized) return message ? <p role="status">{message}</p> : null;
  return (
    <section className="space-y-4 border-t pt-4">
      <h2 className="text-xl font-bold">Administração</h2>
      {message && <p role="status">{message}</p>}
      <h3 className="font-bold">Solicitações de afiliados</h3>
      {accounts.length === 0 ? (
        <p>Nenhuma solicitação pendente.</p>
      ) : (
        <ul>
          {accounts.map((account) => (
            <li key={account.user_id} className="my-2 border p-2">
              <p>{account.full_name}</p>
              <label>
                Percentual de comissão{' '}
                <input
                  className="border p-1"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={values[account.user_id] || ''}
                  onChange={(e) => setValues({ ...values, [account.user_id]: e.target.value })}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const number = Number(values[account.user_id]);
                  if (
                    !values[account.user_id] ||
                    !Number.isFinite(number) ||
                    number < 0 ||
                    number > 100
                  ) {
                    setMessage('Informe um percentual entre 0 e 100.');
                    return;
                  }
                  void submit(
                    `/api/owner/admin/affiliates/${encodeURIComponent(account.user_id)}/approve`,
                    { commissionBasisPoints: Math.round(number * 100) },
                  );
                }}
              >
                Aprovar afiliado
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-bold">Afiliados aprovados</h3>
      {approvedAccounts.length === 0 ? (
        <p>Nenhum afiliado aprovado.</p>
      ) : (
        <ul>
          {approvedAccounts.map((account) => (
            <li key={account.user_id} className="my-2 border p-2">
              <p>
                {account.full_name} · Percentual atual:{' '}
                {Number(account.commission_basis_points ?? 0) / 100}%
              </p>
              <label>
                Novo percentual{' '}
                <input
                  className="border p-1"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={values[`r${account.user_id}`] || ''}
                  onChange={(e) =>
                    setValues({ ...values, [`r${account.user_id}`]: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const raw = values[`r${account.user_id}`];
                  const number = Number(raw);
                  if (!raw || !Number.isFinite(number) || number < 0 || number > 100) {
                    setMessage('Informe um percentual entre 0 e 100.');
                    return;
                  }
                  void submit(
                    `/api/owner/admin/affiliates/${encodeURIComponent(account.user_id)}/rate`,
                    { commissionBasisPoints: Math.round(number * 100) },
                  );
                }}
              >
                Salvar percentual
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-bold">Comissões</h3>
      {commissions.length === 0 ? (
        <p>Nenhuma comissão registrada.</p>
      ) : (
        <ul>
          {commissions.map((item) => (
            <li key={item.id} className="my-2 border p-2">
              <p>
                {item.full_name} · Imóvel {item.listing_id} · Reserva: {item.booking_status} ·
                Pagamento: {item.payment_status || 'pendente'} · Comissão: {item.status}
              </p>
              <p>
                Valor da reserva: R$ {item.quote_total} · Percentual registrado:{' '}
                {Number(item.commission_basis_points ?? 0) / 100}%
              </p>
              {item.status === 'pending' && (
                <>
                  <label>
                    Valor em reais{' '}
                    <input
                      className="border p-1"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={values[`c${item.id}`] || ''}
                      onChange={(e) => setValues({ ...values, [`c${item.id}`]: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const number = Number(values[`c${item.id}`]);
                      if (
                        !Number.isFinite(number) ||
                        number <= 0 ||
                        Math.round(number * 100) > 9999999999
                      ) {
                        setMessage('Informe um valor válido.');
                        return;
                      }
                      void submit(`/api/owner/admin/affiliate-commissions/${item.id}/approve`, {
                        amountCents: Math.round(number * 100),
                      });
                    }}
                  >
                    Aprovar comissão
                  </button>
                </>
              )}
              {item.status === 'approved' && (
                <>
                  <p>Registre o pagamento somente depois de realizar o repasse fora do sistema.</p>
                  <label>
                    Referência do pagamento{' '}
                    <input
                      className="border p-1"
                      maxLength={120}
                      value={values[`p${item.id}`] || ''}
                      onChange={(e) => setValues({ ...values, [`p${item.id}`]: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const paymentReference = (values[`p${item.id}`] || '').trim();
                      if (paymentReference.length < 3) {
                        setMessage('Informe a referência do pagamento.');
                        return;
                      }
                      void submit(`/api/owner/admin/affiliate-commissions/${item.id}/mark-paid`, {
                        paymentReference,
                      });
                    }}
                  >
                    Registrar como paga
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
