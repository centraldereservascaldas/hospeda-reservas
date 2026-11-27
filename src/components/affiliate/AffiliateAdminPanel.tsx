import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { AffiliatePagination } from './AffiliatePagination';

type Account = {
  user_id: string;
  full_name: string;
  nickname?: string | null;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  commission_basis_points?: number;
};
type Listing = { id: string; title: string; enabled: boolean };
type Commission = {
  id: number;
  full_name: string;
  nickname: string | null;
  listing_id: string;
  short_link_token: string | null;
  attributed_at: string | null;
  last_clicked_at: string | null;
  booking_status: string;
  payment_status: string | null;
  status: string;
  approved_amount_cents: number | null;
  calculated_amount_cents: number | null;
  quote_total: string;
  currency: string;
  commission_basis_points: number | null;
};
type CommissionEvent = {
  id: number;
  actorUserId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  evidence: { reasons?: string[]; reason?: string; payment_reference?: string };
  createdAt: string;
};

export function AffiliateAdminPanel({ token }: { token: string }) {
  const [authorized, setAuthorized] = useState(false);
  const requestVersion = useRef(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [approvedAccounts, setApprovedAccounts] = useState<Account[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsUnavailable, setListingsUnavailable] = useState(false);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [commissionEvents, setCommissionEvents] = useState<Record<number, CommissionEvent[]>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const [managedPage, setManagedPage] = useState(1);
  const [commissionPage, setCommissionPage] = useState(1);
  const [pendingMore, setPendingMore] = useState(false);
  const [managedMore, setManagedMore] = useState(false);
  const [commissionMore, setCommissionMore] = useState(false);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [accountsResponse, commissionsResponse, approvedResponse, listingsResponse] =
        await Promise.all([
          apiFetch(`/api/owner/admin/affiliates?page=${pendingPage}`, { headers }),
          apiFetch(`/api/owner/admin/affiliate-commissions?page=${commissionPage}`, { headers }),
          apiFetch(`/api/owner/admin/affiliates/approved?page=${managedPage}`, { headers }),
          apiFetch('/api/owner/admin/affiliate-listings', { headers }).catch(() => null),
        ]);
      if (version !== requestVersion.current) return;
      if (accountsResponse.status === 401 || accountsResponse.status === 403 || accountsResponse.status === 503) {
        setAuthorized(false);
        setAccounts([]);
        setApprovedAccounts([]);
        setCommissions([]);
        setCommissionEvents({});
        if (accountsResponse.status === 401) {
          setMessage('Sua sessão expirou. Saia da conta e entre novamente para reabrir a administração.');
        }
        return;
      }
      if (!accountsResponse.ok || !commissionsResponse.ok || !approvedResponse.ok)
        throw new Error();
      const [a, c, approved, listingData] = await Promise.all([
        accountsResponse.json(),
        commissionsResponse.json(),
        approvedResponse.json(),
        listingsResponse?.ok ? listingsResponse.json() : Promise.resolve(null),
      ]);
      if (version !== requestVersion.current) return;
      setAccounts(Array.isArray(a.accounts) ? a.accounts : []);
      setCommissions(Array.isArray(c.commissions) ? c.commissions : []);
      setApprovedAccounts(Array.isArray(approved.accounts) ? approved.accounts : []);
      setListings(Array.isArray(listingData?.listings) ? listingData.listings : []);
      setListingsUnavailable(!listingsResponse?.ok);
      setPendingMore(a.hasMore === true);
      setManagedMore(approved.hasMore === true);
      setCommissionMore(c.hasMore === true);
      setAuthorized(true);
    } catch {
      if (version !== requestVersion.current) return;
      setMessage('Não foi possível carregar a administração.');
    }
  }, [token, pendingPage, managedPage, commissionPage]);
  useEffect(() => {
    void refresh();
    return () => {
      requestVersion.current += 1;
    };
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
      setMessage('Alteração registrada.');
      await refresh();
    } catch {
      setMessage('Não foi possível registrar a aprovação.');
    }
  }

  async function loadCommissionEvents(commissionId: number) {
    try {
      const response = await apiFetch(`/api/owner/admin/affiliate-commissions/${commissionId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setCommissionEvents((currentEvents) => ({
        ...currentEvents,
        [commissionId]: Array.isArray(payload.events) ? payload.events : [],
      }));
    } catch {
      setMessage('Não foi possível carregar o histórico da comissão.');
    }
  }
  if (!authorized) return message ? <p role="status">{message}</p> : null;
  return (
    <section className="affiliate-admin">
      <div className="affiliate-card-head"><div><h2>Centro de administração</h2><p className="affiliate-card-subtitle">Controle afiliados, catálogo e repasses com segurança.</p></div><span className="affiliate-badge">● Operação interna</span></div>
      {message && <p role="status">{message}</p>}
      <div className="affiliate-admin-section"><h3>Solicitações de afiliados</h3>
      {accounts.length === 0 ? (
        <p>Nenhuma solicitação pendente.</p>
      ) : (
        <ul>
          {accounts.map((account) => (
            <li key={account.user_id} className="affiliate-admin-item">
              <p>{account.full_name}</p>
              <label>
                Percentual de comissão{' '}
                <input
                  className="border p-1"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={values[account.user_id] ?? '3.5'}
                  onChange={(e) => setValues({ ...values, [account.user_id]: e.target.value })}
                />
              </label>
              <button className="affiliate-secondary"
                type="button"
                onClick={() => {
                  const raw = values[account.user_id] ?? '3.5';
                  const number = Number(raw);
                  if (
                    !raw ||
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
              <button className="affiliate-danger"
                type="button"
                onClick={() =>
                  void submit(
                    `/api/owner/admin/affiliates/${encodeURIComponent(account.user_id)}/status`,
                    { action: 'reject' },
                  )
                }
              >
                Recusar solicitação
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
      <AffiliatePagination
        page={pendingPage}
        hasMore={pendingMore}
        onChange={setPendingPage}
        label="Páginas de solicitações"
      />
      <div className="affiliate-admin-section"><h3>Afiliados cadastrados</h3>
      {approvedAccounts.length === 0 ? (
        <p>Nenhum afiliado cadastrado.</p>
      ) : (
        <ul>
          {approvedAccounts.map((account) => (
            <li key={account.user_id} className="affiliate-admin-item">
              <p>
                {account.full_name}{account.nickname ? ` · @${account.nickname}` : ''} · Percentual atual:{' '}
                {Number(account.commission_basis_points ?? 0) / 100}% ·{' '}
                {account.status === 'approved'
                  ? 'Ativo'
                  : account.status === 'suspended'
                    ? 'Suspenso'
                    : 'Recusado'}
              </p>
              <label>
                Novo percentual{' '}
                <input
                  className="border p-1"
                  type="number"
                  disabled={account.status !== 'approved'}
                  min="0"
                  max="100"
                  step="0.01"
                  value={values[`r${account.user_id}`] || ''}
                  onChange={(e) =>
                    setValues({ ...values, [`r${account.user_id}`]: e.target.value })
                  }
                />
              </label>
              <button className="affiliate-secondary"
                type="button"
                disabled={account.status !== 'approved'}
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
              {account.status === 'rejected' && (
                <button className="affiliate-secondary"
                  type="button"
                  onClick={() =>
                    void submit(
                      `/api/owner/admin/affiliates/${encodeURIComponent(account.user_id)}/status`,
                      { action: 'reconsider' },
                    )
                  }
                >
                  Reabrir solicitação
                </button>
              )}
              {account.status !== 'rejected' && (
                <button className="affiliate-danger"
                  type="button"
                  onClick={() =>
                    void submit(
                      `/api/owner/admin/affiliates/${encodeURIComponent(account.user_id)}/status`,
                      { action: account.status === 'approved' ? 'suspend' : 'reactivate' },
                    )
                  }
                >
                  {account.status === 'approved' ? 'Suspender afiliado' : 'Reativar afiliado'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
      <AffiliatePagination
        page={managedPage}
        hasMore={managedMore}
        onChange={setManagedPage}
        label="Páginas de afiliados"
      />
      <div className="affiliate-admin-section"><h3>Imóveis para divulgação</h3>
      <p>
        Todos os imóveis ativos estão liberados inicialmente. Imóveis bloqueados não aparecem para
        afiliados, não geram novos links e deixam de registrar cliques em links existentes.
      </p>
      {listingsUnavailable ? (
        <p>Não foi possível carregar os imóveis. Tente novamente.</p>
      ) : listings.length === 0 ? (
        <p>Nenhum imóvel disponível.</p>
      ) : (
        <ul>
          {listings.map((listing) => (
            <li key={listing.id} className="affiliate-admin-item">
              <span>
                {listing.title} · {listing.enabled ? 'Liberado' : 'Bloqueado'}
              </span>{' '}
              <button className="affiliate-secondary"
                type="button"
                onClick={() =>
                  void submit(
                    `/api/owner/admin/affiliate-listings/${encodeURIComponent(listing.id)}`,
                    { enabled: !listing.enabled },
                  )
                }
              >
                {listing.enabled ? 'Bloquear novos links' : 'Liberar imóvel'}
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
      <div className="affiliate-admin-section"><h3>Comissões</h3>
      {commissions.length === 0 ? (
        <p>Nenhuma comissão registrada.</p>
      ) : (
        <ul>
          {commissions.map((item) => (
            <li key={item.id} className="affiliate-admin-item">
              <p>
                {item.full_name}{item.nickname ? ` · @${item.nickname}` : ''} · Imóvel {item.listing_id} · Reserva: {item.booking_status} ·
                Pagamento: {item.payment_status || 'pendente'} · Comissão: {item.status}
              </p>
              {item.short_link_token && (
                <p>Link /a/{item.short_link_token} · Atribuída em: {item.attributed_at || 'indisponível'} · Último clique: {item.last_clicked_at || 'indisponível'}</p>
              )}
              <p>
                Valor da reserva: R$ {item.quote_total} · Percentual registrado:{' '}
                {Number(item.commission_basis_points ?? 0) / 100}%
              </p>
              <button className="affiliate-secondary" type="button" onClick={() => void loadCommissionEvents(item.id)}>
                Ver histórico de auditoria
              </button>
              {commissionEvents[item.id] && (
                <ul aria-label={`Histórico da comissão ${item.id}`}>
                  {commissionEvents[item.id].map((event) => (
                    <li key={event.id}>
                      {event.createdAt} · {event.type} · {event.fromStatus || 'inicial'} → {event.toStatus || 'sem alteração'}
                      {event.evidence.reason ? ` · Motivo: ${event.evidence.reason}` : ''}
                      {event.evidence.reasons?.length ? ` · Bloqueios: ${event.evidence.reasons.join(', ')}` : ''}
                      {event.evidence.payment_reference ? ` · Ref.: ${event.evidence.payment_reference}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {item.status === 'pending' && (
                <>
                  <p>
                    Comissão estimada pelo servidor:{' '}
                    {item.calculated_amount_cents === null
                      ? 'indisponível para esta reserva'
                      : new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: item.currency,
                        }).format(item.calculated_amount_cents / 100)}{' '}
                    ({((item.commission_basis_points ?? 350) / 100).toLocaleString('pt-BR')}% do valor da reserva)
                  </p>
                  <label>
                    Motivo da aprovação{' '}
                    <textarea
                      className="border p-1"
                      minLength={10}
                      maxLength={500}
                      value={values[`r${item.id}`] || ''}
                      onChange={(e) => setValues({ ...values, [`r${item.id}`]: e.target.value })}
                    />
                  </label>
                  <button className="affiliate-secondary"
                    type="button"
                    onClick={() => {
                      const reason = (values[`r${item.id}`] || '').trim();
                      if (reason.length < 10) {
                        setMessage('Informe um motivo de pelo menos 10 caracteres.');
                        return;
                      }
                      void submit(`/api/owner/admin/affiliate-commissions/${item.id}/approve`, {
                        reason,
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
                  <button className="affiliate-secondary"
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
      </div>
      <AffiliatePagination
        page={commissionPage}
        hasMore={commissionMore}
        onChange={setCommissionPage}
        label="Páginas de comissões"
      />
    </section>
  );
}
