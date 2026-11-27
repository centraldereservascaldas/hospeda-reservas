import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { apiFetch } from '../../services/apiFetch';
import { AffiliateAdminPanel } from './AffiliateAdminPanel';
import { AffiliatePagination } from './AffiliatePagination';
import './affiliate-portal.css';

type Property = {
  id: string;
  staysListingId?: string;
  title?: string;
  name?: string;
  images?: string[];
};
type Conversion = {
  listing_id: string;
  check_in: string;
  check_out: string;
  booking_status: string;
  commission_status: string;
  approved_amount_cents: number | null;
};
const commissionLabels: Record<string, string> = {
  pending: 'Pendente de aprovação',
  approved: 'Aprovada',
  paid: 'Paga',
  rejected: 'Não aprovada',
};
const bookingLabels: Record<string, string> = {
  cotado: 'Em andamento',
  pre_reservado: 'Pré-reserva',
  pagamento_pendente: 'Pagamento pendente',
  pago_em_confirmacao: 'Em confirmação',
  confirmado: 'Confirmada',
  concluido: 'Concluída',
  expirado: 'Expirada',
  cancelamento_solicitado: 'Cancelamento solicitado',
  reembolsado: 'Reembolsada',
  atencao_operacional: 'Em análise',
};

export function AffiliatePortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [status, setStatus] = useState('loading');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState('');
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [clicks, setClicks] = useState(0);
  const [nickname, setNickname] = useState('');
  const [conversionPage, setConversionPage] = useState(1);
  const [conversionMore, setConversionMore] = useState(false);
  const [message, setMessage] = useState('');
  const [requestingAccess, setRequestingAccess] = useState(false);
  const activeToken = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const visibleProperties = properties.filter((property) =>
    `${property.title || property.name || ''} ${property.id}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );

  useEffect(() => {
    if (!supabase) {
      setStatus('unavailable');
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      activeToken.current = data.session?.access_token ?? null;
      setSession(data.session);
      setStatus(data.session ? 'loading' : 'login');
    });
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      activeToken.current = current?.access_token ?? null;
      setSession(current);
      if (!current) {
        setLinks({});
        setProperties([]);
        setConversions([]);
        setConversionPage(1);
        setConversionMore(false);
        setStatus('login');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(
    async (token: string) => {
      const version = ++loadVersion.current;
      try {
        const response = await apiFetch('/api/affiliate/access', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (activeToken.current !== token || version !== loadVersion.current) return;
        if (!response.ok || !data.success)
          throw new Error('Não foi possível consultar seu acesso.');
        setStatus(data.status);
        setNickname(typeof data.nickname === 'string' ? data.nickname : '');
        if (data.status !== 'approved') return;
        const [catalogResponse, dashboardResponse] = await Promise.all([
          apiFetch('/api/affiliate/catalog', { headers: { Authorization: `Bearer ${token}` } }),
          apiFetch(`/api/affiliate/dashboard?page=${conversionPage}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!catalogResponse.ok || !dashboardResponse.ok)
          throw new Error('Não foi possível carregar os dados.');
        const [catalog, dashboard] = await Promise.all([
          catalogResponse.json(),
          dashboardResponse.json(),
        ]);
        if (activeToken.current !== token || version !== loadVersion.current) return;
        setProperties(Array.isArray(catalog.data) ? catalog.data : []);
        setConversions(Array.isArray(dashboard.conversions) ? dashboard.conversions : []);
        setClicks(Number.isSafeInteger(dashboard.clicks) ? dashboard.clicks : 0);
        setConversionMore(dashboard.hasMore === true);
      } catch {
        if (activeToken.current !== token || version !== loadVersion.current) return;
        setStatus('error');
        setMessage('Não foi possível carregar os dados. Tente novamente.');
      }
    },
    [conversionPage],
  );

  useEffect(() => {
    if (session?.access_token) void load(session.access_token);
    return () => {
      loadVersion.current += 1;
    };
  }, [session?.access_token, load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (registering && fullName.trim().split(/\s+/).length < 2) {
      setMessage('Informe seu nome completo.');
      return;
    }
    const result = registering
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/afiliados`,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setPassword('');
    if (result.error)
      setMessage(
        registering
          ? 'Não foi possível criar a conta. Confira os dados.'
          : 'Não foi possível entrar. Confira seu e-mail e senha.',
      );
    else if (registering && !result.data.session)
      setMessage('Confira seu e-mail para confirmar a conta e depois entre no portal.');
  }

  async function requestAccess() {
    if (!session || requestingAccess) return;
    setRequestingAccess(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/affiliate/access', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        await load(session.access_token);
      } else {
        setMessage('Não foi possível solicitar acesso. Tente novamente.');
      }
    } catch {
      setMessage('Não foi possível conectar ao serviço. A solicitação não foi confirmada. Tente novamente.');
    } finally {
      setRequestingAccess(false);
    }
  }

  async function generateLink(id: string) {
    if (!session) return;
    const token = session.access_token;
    try {
      const response = await apiFetch(`/api/affiliate/links/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (activeToken.current !== token) return;
      if (!response.ok || typeof data.shortUrl !== 'string')
        throw new Error();
      const shortUrl = new URL(data.shortUrl, window.location.origin);
      if (shortUrl.origin !== window.location.origin || !/^\/a\/[A-Za-z0-9]{24}$/.test(shortUrl.pathname))
        throw new Error();
      setLinks((current) => ({
        ...current,
        [id]: shortUrl.toString(),
      }));
    } catch {
      setMessage('Não foi possível gerar o link. Confira se o imóvel continua disponível.');
    }
  }

  return (
    <main className="affiliate-shell">
      <div className="affiliate-wrap">
      <header className="affiliate-topbar">
        <div className="affiliate-brand"><span className="affiliate-mark">C</span><div><p className="affiliate-kicker">Central de Reservas</p><h1 className="affiliate-title">Portal de afiliados</h1></div></div>
        {session && <div className="affiliate-user-actions"><span className="affiliate-user-pill">Área segura do parceiro</span><button className="affiliate-logout" type="button" onClick={() => void supabase?.auth.signOut()}>Sair</button></div>}
      </header>
      {message && <p role="status">{message}</p>}
      {status === 'loading' && <p role="status">Carregando…</p>}
      {status === 'unavailable' && <p>O acesso está temporariamente indisponível.</p>}
      {status === 'login' && (
        <form onSubmit={login} className="grid max-w-sm gap-3">
          {registering && (
            <label>
              Nome completo
              <input
                className="block w-full border p-2"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            E-mail
            <input
              className="block w-full border p-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              className="block w-full border p-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="rounded bg-orange-600 p-2 text-white" type="submit">
            {registering ? 'Criar conta' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setRegistering(!registering);
              setMessage('');
              setPassword('');
            }}
          >
            {registering ? 'Já tenho conta' : 'Criar conta'}
          </button>
          <p>Após entrar, solicite seu acesso de afiliado para aprovação da Central.</p>
        </form>
      )}
      {status === 'none' && (
        <button type="button" disabled={requestingAccess} onClick={() => void requestAccess()}>
          {requestingAccess ? 'Enviando solicitação…' : 'Solicitar acesso de afiliado'}
        </button>
      )}
      {status === 'pending' && <p>Seu acesso está aguardando aprovação da Central.</p>}
      {['suspended', 'rejected'].includes(status) && (
        <p>Entre em contato com a Central sobre seu acesso.</p>
      )}
      {status === 'error' && session && (
        <button type="button" onClick={() => void load(session.access_token)}>
          Tentar novamente
        </button>
      )}
      {status === 'approved' && (
        <>
          <section className="affiliate-hero"><div className="affiliate-hero-card"><h2>Seu catálogo, suas indicações, seu crescimento.</h2><p>Escolha os imóveis que combinam com o seu público, gere um link exclusivo e acompanhe cada reserva em um só lugar.</p>{nickname && <p className="affiliate-stat-foot">Nickname: <strong>{nickname}</strong></p>}</div><div className="affiliate-stat-card"><span className="affiliate-stat-label">Cliques registrados</span><strong className="affiliate-stat-value">{clicks}</strong><span className="affiliate-stat-foot">Atribuição válida por 7 dias</span></div></section>
          <div className="affiliate-grid"><section className="affiliate-card affiliate-card-wide">
            <div className="affiliate-card-head"><div><h2>Imóveis para divulgar</h2><p className="affiliate-card-subtitle">Links rastreáveis para você compartilhar. Preços e disponibilidade são confirmados pelo cliente.</p></div></div>
            <label>
              <input
                className="affiliate-search"
                aria-label="Buscar imóvel"
                placeholder="Buscar por nome ou código do imóvel"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {properties.length === 0 && <p className="affiliate-empty">Nenhum imóvel disponível no catálogo agora.</p>}
            {properties.length > 0 && visibleProperties.length === 0 && (
              <p>Nenhum imóvel encontrado.</p>
            )}
            <ul className="affiliate-listing-grid">
              {visibleProperties.map((property) => {
                const id = property.id;
                const link = links[id];
                return (
                  <li key={id} className="affiliate-listing">
                    {property.images?.[0] && (
                      <img
                        src={property.images[0]}
                        alt=""
                        loading="lazy"
                        className=""
                      />
                    )}
                    <div className="affiliate-listing-body"><p className="affiliate-listing-title">{property.title || property.name || id}</p><div className="affiliate-listing-meta"><span>Link individual</span>
                    {!link && (
                      <button className="affiliate-primary" type="button" onClick={() => void generateLink(id)}>
                        Gerar link
                      </button>
                    )}
                    {link && (
                      <>
                        <div className="affiliate-linkbox"><input aria-label="Seu link" readOnly value={link} />
                        <button
                          className="affiliate-secondary"
                          type="button"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(link)
                              .then(() => setMessage('Link copiado.'))
                              .catch(() => setMessage('Selecione e copie o link.'))
                          }
                        >
                          Copiar link
                        </button>
                        </div>
                      </>
                    )}
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section><section className="affiliate-card affiliate-card-wide">
            <div className="affiliate-card-head"><div><h2>Reservas e comissões</h2><p className="affiliate-card-subtitle">Acompanhe a jornada de cada indicação com transparência.</p></div><span className="affiliate-badge">● Em acompanhamento</span></div>
            {conversions.length === 0 ? (
              <p>Nenhuma reserva atribuída ainda.</p>
            ) : (
              <ul>
                {conversions.map((item, index) => (
                  <li key={`${item.listing_id}-${index}`} className="affiliate-conversion"><div className="affiliate-conversion-main"><p className="affiliate-conversion-title">Imóvel {item.listing_id}</p><span className="affiliate-conversion-meta">{item.check_in} a {item.check_out} · Reserva: {bookingLabels[item.booking_status] || 'Em andamento'}</span></div><span className="affiliate-badge">{commissionLabels[item.commission_status] || 'Em análise'}
                    {item.approved_amount_cents !== null &&
                      ` · R$ ${(item.approved_amount_cents / 100).toFixed(2).replace('.', ',')}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <AffiliatePagination
              page={conversionPage}
              hasMore={conversionMore}
              onChange={setConversionPage}
              label="Páginas de reservas e comissões"
            />
          </section></div>
        </>
      )}
      {session && <AffiliateAdminPanel token={session.access_token} />}
      </div>
    </main>
  );
}
