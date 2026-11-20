import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { apiFetch } from '../../services/apiFetch';
import { AffiliateAdminPanel } from './AffiliateAdminPanel';

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
  const [message, setMessage] = useState('');
  const activeToken = useRef<string | null>(null);
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
        setStatus('login');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function load(token: string) {
    try {
      const response = await apiFetch('/api/affiliate/access', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (activeToken.current !== token) return;
      if (!response.ok || !data.success) throw new Error('Não foi possível consultar seu acesso.');
      setStatus(data.status);
      if (data.status !== 'approved') return;
      const [catalogResponse, dashboardResponse] = await Promise.all([
        apiFetch('/api/accommodations'),
        apiFetch('/api/affiliate/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!catalogResponse.ok || !dashboardResponse.ok)
        throw new Error('Não foi possível carregar os dados.');
      const [catalog, dashboard] = await Promise.all([
        catalogResponse.json(),
        dashboardResponse.json(),
      ]);
      if (activeToken.current !== token) return;
      setProperties(Array.isArray(catalog.data) ? catalog.data : []);
      setConversions(Array.isArray(dashboard.conversions) ? dashboard.conversions : []);
    } catch {
      if (activeToken.current !== token) return;
      setStatus('error');
      setMessage('Não foi possível carregar os dados. Tente novamente.');
    }
  }

  useEffect(() => {
    if (session?.access_token) void load(session.access_token);
  }, [session?.access_token]);

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
    if (!session) return;
    const response = await apiFetch('/api/affiliate/access', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) await load(session.access_token);
    else setMessage('Não foi possível solicitar acesso.');
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
      if (
        !response.ok ||
        !/^[A-Za-z0-9]{40}$/.test(data.referralCode) ||
        !/^[a-f0-9]{64}$/.test(data.signature)
      )
        throw new Error();
      const query = new URLSearchParams({ ref: data.referralCode, sig: data.signature });
      setLinks((current) => ({
        ...current,
        [id]: `${window.location.origin}/apartamento/${encodeURIComponent(id)}?${query}`,
      }));
    } catch {
      setMessage('Não foi possível gerar o link. Confira se o imóvel continua disponível.');
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Portal de afiliados</h1>
      {session && (
        <button type="button" onClick={() => void supabase?.auth.signOut()}>
          Sair da conta
        </button>
      )}
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
        <button type="button" onClick={() => void requestAccess()}>
          Solicitar acesso de afiliado
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
          <section>
            <h2 className="text-xl font-bold">Imóveis para divulgar</h2>
            <p>Preços e disponibilidade são confirmados para as datas escolhidas pelo cliente.</p>
            <label>
              Buscar imóvel{' '}
              <input
                className="block w-full border p-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {properties.length === 0 && <p>Nenhum imóvel disponível no catálogo agora.</p>}
            {properties.length > 0 && visibleProperties.length === 0 && (
              <p>Nenhum imóvel encontrado.</p>
            )}
            <ul>
              {visibleProperties.map((property) => {
                const id = property.id;
                const link = links[id];
                return (
                  <li key={id} className="my-3 rounded border p-3">
                    {property.images?.[0] && (
                      <img
                        src={property.images[0]}
                        alt=""
                        loading="lazy"
                        className="h-36 w-full rounded object-cover"
                      />
                    )}
                    <p>{property.title || property.name || id}</p>
                    {!link && (
                      <button type="button" onClick={() => void generateLink(id)}>
                        Gerar link
                      </button>
                    )}
                    {link && (
                      <>
                        <label>
                          Seu link
                          <input className="block w-full border p-2" readOnly value={link} />
                        </label>
                        <button
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
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-bold">Reservas e comissões</h2>
            <p>As comissões dependem de conferência e aprovação da Central.</p>
            {conversions.length === 0 ? (
              <p>Nenhuma reserva atribuída ainda.</p>
            ) : (
              <ul>
                {conversions.map((item, index) => (
                  <li key={`${item.listing_id}-${index}`} className="my-2 border p-2">
                    Imóvel {item.listing_id} · {item.check_in} a {item.check_out} · Reserva:{' '}
                    {bookingLabels[item.booking_status] || 'Em andamento'} · Comissão:{' '}
                    {commissionLabels[item.commission_status] || 'Em análise'}
                    {item.approved_amount_cents !== null &&
                      ` · R$ ${(item.approved_amount_cents / 100).toFixed(2).replace('.', ',')}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {session && <AffiliateAdminPanel token={session.access_token} />}
    </main>
  );
}
