import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowUpRight,
  BadgeDollarSign,
  ChartNoAxesCombined,
  CircleHelp,
  ClipboardList,
  Copy,
  Link2,
  MousePointer2,
  Wallet,
} from 'lucide-react';
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
  previewLabel?: string;
};
type ConversionFilters = {
  listingId: string;
  commissionStatus: string;
  from: string;
  to: string;
};
type PortalTab = 'overview' | 'links' | 'commissions' | 'finance' | 'admin';
const localPreviewProperties: Property[] = [
  {
    id: 'PREVIEW-AF-101',
    title: 'Flat moderno no Centro',
    images: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
    ],
  },
  {
    id: 'PREVIEW-AF-202',
    title: 'Apartamento com parque aquático',
    images: [
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
    ],
  },
  {
    id: 'PREVIEW-AF-303',
    title: 'Suíte para curtir em família',
    images: [
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=800&q=80',
    ],
  },
];
const localPreviewConversions: Conversion[] = [
  {
    listing_id: 'PREVIEW-AF-101',
    previewLabel: 'Flat moderno no Centro',
    check_in: '2026-11-18',
    check_out: '2026-11-21',
    booking_status: 'concluido',
    commission_status: 'approved',
    approved_amount_cents: 12600,
  },
  {
    listing_id: 'PREVIEW-AF-202',
    previewLabel: 'Apartamento com parque aquático',
    check_in: '2026-12-05',
    check_out: '2026-12-08',
    booking_status: 'confirmado',
    commission_status: 'pending',
    approved_amount_cents: null,
  },
  {
    listing_id: 'PREVIEW-AF-303',
    previewLabel: 'Suíte para curtir em família',
    check_in: '2027-01-12',
    check_out: '2027-01-15',
    booking_status: 'cancelamento_solicitado',
    commission_status: 'rejected',
    approved_amount_cents: null,
  },
];
const commissionLabels: Record<string, string> = {
  pending: 'Pendente de aprovação',
  review: 'Em análise',
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
const commissionExplanations: Record<string, string> = {
  pending: 'A indicação foi registrada. A comissão aguarda a confirmação da estadia e do pagamento.',
  review: 'A comissão está em revisão pela equipe. O valor fica oculto enquanto os dados são conferidos.',
  approved: 'A estadia foi concluída e a comissão aprovada. O repasse ainda não foi marcado como pago.',
  paid: 'O pagamento desta comissão foi registrado.',
  rejected: 'Esta indicação não gerou comissão.',
};

function authenticationErrorMessage(error: unknown, registering: boolean): string {
  if (error instanceof Error) {
    const message = error.message.toLocaleLowerCase('en-US');
    const name = error.name.toLocaleLowerCase('en-US');
    const status = 'status' in error && typeof error.status === 'number' ? error.status : null;

    if (
      name.includes('retryablefetch') ||
      status === 0 ||
      (status !== null && status >= 500) ||
      /failed to fetch|fetch failed|network|dns|timeout/.test(message)
    ) {
      return 'Não foi possível conectar ao serviço de login. Tente novamente mais tarde ou avise a Central.';
    }
  }

  return registering
    ? 'Não foi possível criar a conta. Confira os dados e tente novamente.'
    : 'Não foi possível entrar. Confira seu e-mail e senha.';
}

function ConversionRow({ item }: { item: Conversion }) {
  const propertyLabel = item.previewLabel || `Imóvel ${item.listing_id}`;
  const dates = `${new Date(`${item.check_in}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${item.check_out}T12:00:00`).toLocaleDateString('pt-BR')}`;
  const status = commissionLabels[item.commission_status] || 'Em análise';

  return (
    <div className="affiliate-conversion">
      <div className="affiliate-conversion-main">
        <p className="affiliate-conversion-title">{propertyLabel}</p>
        <span className="affiliate-conversion-meta">Estadia: {dates}</span>
      </div>
      <div className="affiliate-conversion-status">
        <span className={`affiliate-commission-status status-${item.commission_status}`}>
          <i className="status-dot" />
          {status}
        </span>
        {item.approved_amount_cents !== null && (
          <strong>R$ {(item.approved_amount_cents / 100).toFixed(2).replace('.', ',')}</strong>
        )}
        <small>{bookingLabels[item.booking_status] || 'Reserva em andamento'}</small>
        <details className="affiliate-status-help">
          <summary>Sobre este status</summary>
          <p>{commissionExplanations[item.commission_status] || commissionExplanations.review}</p>
        </details>
      </div>
    </div>
  );
}

export function AffiliatePortal({ localPreview = false }: { localPreview?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [status, setStatus] = useState('loading');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState('');
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [clicks, setClicks] = useState(0);
  const [nickname, setNickname] = useState('');
  const [conversionPage, setConversionPage] = useState(1);
  const [conversionFilters, setConversionFilters] = useState<ConversionFilters>({
    listingId: '',
    commissionStatus: '',
    from: '',
    to: '',
  });
  const [conversionMore, setConversionMore] = useState(false);
  const [message, setMessage] = useState('');
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [canManageAffiliateAdmin, setCanManageAffiliateAdmin] = useState(false);
  const activeToken = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const visibleProperties = properties.filter((property) =>
    `${property.title || property.name || ''} ${property.id}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );
  const displayedConversions = conversions.filter((item) => {
    if (conversionFilters.listingId && item.listing_id !== conversionFilters.listingId) return false;
    if (conversionFilters.commissionStatus && item.commission_status !== conversionFilters.commissionStatus) return false;
    if (conversionFilters.from && item.check_in < conversionFilters.from) return false;
    if (conversionFilters.to && item.check_in > conversionFilters.to) return false;
    return true;
  });
  const hasConversionFilters = Object.values(conversionFilters).some(Boolean);
  useEffect(() => {
    if (localPreview) {
      setStatus('approved');
      setNickname('afiliado-demo-local');
      setProperties(localPreviewProperties);
      setClicks(284);
      setConversions(localPreviewConversions);
      return;
    }
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
        setCanManageAffiliateAdmin(false);
        setActiveTab('overview');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [localPreview]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || localPreview) {
      setCanManageAffiliateAdmin(false);
      return;
    }

    let isCurrent = true;
    setCanManageAffiliateAdmin(false);
    void apiFetch('/api/owner/admin/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (isCurrent && activeToken.current === token) {
          setCanManageAffiliateAdmin(data?.canManagePayments === true);
        }
      })
      .catch(() => {
        if (isCurrent) setCanManageAffiliateAdmin(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.access_token, localPreview]);

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
          apiFetch(`/api/affiliate/dashboard?${new URLSearchParams({
            page: String(conversionPage),
            ...(conversionFilters.listingId ? { listingId: conversionFilters.listingId } : {}),
            ...(conversionFilters.commissionStatus ? { commissionStatus: conversionFilters.commissionStatus } : {}),
            ...(conversionFilters.from ? { from: conversionFilters.from } : {}),
            ...(conversionFilters.to ? { to: conversionFilters.to } : {}),
          }).toString()}`, {
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
    [conversionPage, conversionFilters],
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
    setAuthBusy(true);
    setMessage('');
    const normalizedEmail = email.trim().toLowerCase();
    if (recoveringPassword) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/confirm`,
        });
        if (error) throw error;
        setMessage(
          'Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. Confira também a pasta de spam.',
        );
      } catch {
        setMessage(
          'Não foi possível solicitar a redefinição agora. Confira o e-mail e tente novamente.',
        );
      } finally {
        setAuthBusy(false);
      }
      return;
    }
    if (registering && fullName.trim().split(/\s+/).length < 2) {
      setMessage('Informe seu nome completo.');
      setAuthBusy(false);
      return;
    }
    if (registering && password.length < 8) {
      setMessage('A senha precisa ter pelo menos 8 caracteres.');
      setAuthBusy(false);
      return;
    }
    try {
      const result = registering
        ? await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: { full_name: fullName.trim() },
              emailRedirectTo: `${window.location.origin}/afiliados`,
            },
          })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      setPassword('');
      if (result.error) setMessage(authenticationErrorMessage(result.error, registering));
      else if (registering && !result.data.session)
        setMessage('Confira seu e-mail para confirmar a conta e depois entre no portal.');
    } catch (error) {
      setPassword('');
      setMessage(authenticationErrorMessage(error, registering));
    } finally {
      setAuthBusy(false);
    }
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
      setMessage(
        'Não foi possível conectar ao serviço. A solicitação não foi confirmada. Tente novamente.',
      );
    } finally {
      setRequestingAccess(false);
    }
  }

  async function generateLink(id: string) {
    if (localPreview) {
      setLinks((current) => ({
        ...current,
        [id]: `${window.location.origin}/a/preview-${encodeURIComponent(id.toLowerCase())}`,
      }));
      return;
    }
    if (!session) return;
    const token = session.access_token;
    try {
      const response = await apiFetch(`/api/affiliate/links/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (activeToken.current !== token) return;
      if (!response.ok || typeof data.shortUrl !== 'string') throw new Error();
      const shortUrl = new URL(data.shortUrl, window.location.origin);
      if (
        shortUrl.origin !== window.location.origin ||
        !/^\/a\/[A-Za-z0-9]{24}$/.test(shortUrl.pathname)
      )
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
          <a className="affiliate-brand" href="/" aria-label="Central de Reservas, página inicial">
            <span className="affiliate-mark">C</span>
            <div>
              <p className="affiliate-kicker">Central de Reservas</p>
              <h1 className="affiliate-title">Portal de afiliados</h1>
            </div>
          </a>
          {session && (
            <div className="affiliate-user-actions">
              <span className="affiliate-user-pill">Área do parceiro</span>
              <button
                className="affiliate-logout"
                type="button"
                onClick={() => void supabase?.auth.signOut()}
              >
                Sair
              </button>
            </div>
          )}
        </header>
        {localPreview && (
          <div role="status" className="affiliate-notice">
            Prévia local do afiliado. Imóveis são fictícios. Cliques, links, reservas e comissões
            não são reais.
          </div>
        )}
        {message && (
          <p role="status" className="affiliate-notice">
            {message}
          </p>
        )}
        {status === 'loading' && (
          <p role="status" className="affiliate-state-card">
            Carregando seu portal…
          </p>
        )}
        {status === 'unavailable' && (
          <p role="status" className="affiliate-notice">
            O acesso está temporariamente indisponível.
          </p>
        )}
        {status === 'login' && (
          <section className="affiliate-auth-card">
            <div className="affiliate-auth-intro">
              <span className="affiliate-auth-icon">
                <Link2 size={20} aria-hidden="true" />
              </span>
              <p className="affiliate-kicker">Sua próxima indicação começa aqui</p>
              <h2>
                {recoveringPassword
                  ? 'Recuperar senha'
                  : registering
                    ? 'Crie sua conta de afiliado'
                    : 'Entre no seu portal'}
              </h2>
              <p>Acompanhe seus links e indicações em um só lugar.</p>
            </div>
            <form onSubmit={login} className="affiliate-auth-form">
              {registering && !recoveringPassword && (
                <label>
                  Nome completo
                  <input
                    className="affiliate-input"
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
                  className="affiliate-input"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              {!recoveringPassword && (
                <label>
                  Senha
                  <input
                    className="affiliate-input"
                    autoComplete={registering ? 'new-password' : 'current-password'}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
              )}
              {!registering && !recoveringPassword && (
                <button
                  className="affiliate-text-button affiliate-forgot-password"
                  type="button"
                  onClick={() => {
                    setRecoveringPassword(true);
                    setMessage('');
                    setPassword('');
                  }}
                >
                  Esqueci minha senha
                </button>
              )}
              <button className="affiliate-primary" type="submit" disabled={authBusy}>
                {authBusy
                  ? 'Aguarde…'
                  : recoveringPassword
                    ? 'Enviar link de recuperação'
                    : registering
                      ? 'Criar conta'
                      : 'Entrar'}
              </button>
              <button
                className="affiliate-text-button"
                type="button"
                onClick={() => {
                  if (recoveringPassword) {
                    setRecoveringPassword(false);
                    setMessage('');
                    return;
                  }
                  setRegistering(!registering);
                  setMessage('');
                  setPassword('');
                }}
              >
                {recoveringPassword
                  ? 'Voltar para entrar'
                  : registering
                    ? 'Já tenho conta'
                    : 'Criar conta'}
              </button>
              {!recoveringPassword && (
                <p>Após entrar, solicite seu acesso de afiliado para aprovação da Central.</p>
              )}
            </form>
          </section>
        )}
        {status === 'none' && (
          <section className="affiliate-state-card">
            <span className="affiliate-state-icon">
              <Link2 size={21} aria-hidden="true" />
            </span>
            <h2>Seu perfil de afiliado</h2>
            <p>Solicite acesso para divulgar imóveis e acompanhar suas indicações pelo portal.</p>
            <button
              className="affiliate-primary"
              type="button"
              disabled={requestingAccess}
              onClick={() => void requestAccess()}
            >
              {requestingAccess ? 'Enviando solicitação…' : 'Solicitar acesso de afiliado'}
            </button>
          </section>
        )}
        {status === 'pending' && (
          <section className="affiliate-state-card">
            <span className="affiliate-state-icon is-pending">
              <MousePointer2 size={21} aria-hidden="true" />
            </span>
            <h2>Solicitação recebida</h2>
            <p>
              Seu acesso está aguardando aprovação da Central. Você poderá acompanhar o status por
              aqui.
            </p>
          </section>
        )}
        {['suspended', 'rejected'].includes(status) && (
          <section className="affiliate-state-card">
            <span className="affiliate-state-icon is-pending">
              <MousePointer2 size={21} aria-hidden="true" />
            </span>
            <h2>Não foi possível liberar seu acesso</h2>
            <p>Entre em contato com a Central para entender a situação da sua solicitação.</p>
          </section>
        )}
        {status === 'error' && session && (
          <button
            className="affiliate-primary"
            type="button"
            onClick={() => void load(session.access_token)}
          >
            Tentar novamente
          </button>
        )}
        {status === 'approved' && (
          <>
            <div className="affiliate-workspace">
              <aside className="affiliate-sidebar" aria-label="Navegação do portal">
                <div className="affiliate-sidebar-heading">
                  <span className="affiliate-avatar">
                    {nickname.slice(0, 1).toUpperCase() || 'A'}
                  </span>
                  <div>
                    <strong>{nickname || 'Meu portal'}</strong>
                    <span>Afiliado aprovado</span>
                  </div>
                </div>
                <nav className="affiliate-nav">
                  <button
                    aria-current={activeTab === 'overview' ? 'page' : undefined}
                    className={activeTab === 'overview' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setActiveTab('overview')}
                  >
                    <ChartNoAxesCombined size={18} aria-hidden="true" />
                    Visão geral
                  </button>
                  <button
                    aria-current={activeTab === 'links' ? 'page' : undefined}
                    className={activeTab === 'links' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setActiveTab('links')}
                  >
                    <Link2 size={18} aria-hidden="true" />
                    Divulgar imóveis
                  </button>
                  <button
                    aria-current={activeTab === 'commissions' ? 'page' : undefined}
                    className={activeTab === 'commissions' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setActiveTab('commissions')}
                  >
                    <ClipboardList size={18} aria-hidden="true" />
                    Indicações
                  </button>
                  <button
                    aria-current={activeTab === 'finance' ? 'page' : undefined}
                    className={activeTab === 'finance' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setActiveTab('finance')}
                  >
                    <Wallet size={18} aria-hidden="true" />
                    Financeiro
                  </button>
                  {canManageAffiliateAdmin && (
                    <button
                      aria-current={activeTab === 'admin' ? 'page' : undefined}
                      className={activeTab === 'admin' ? 'is-active' : ''}
                      type="button"
                      onClick={() => setActiveTab('admin')}
                    >
                      <ClipboardList size={18} aria-hidden="true" />
                      Administração
                    </button>
                  )}
                </nav>
                <a className="affiliate-sidebar-help" href="mailto:centraldereservascn@gmail.com">
                  <CircleHelp size={17} aria-hidden="true" />
                  <span>
                    Precisa de ajuda?<small>Fale com a Central</small>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </aside>
              <div className="affiliate-page">
                <header className="affiliate-page-heading">
                  <div>
                    <p className="affiliate-kicker">Área do afiliado</p>
                    <h2>
                      {activeTab === 'overview'
                        ? 'Visão geral'
                        : activeTab === 'links'
                          ? 'Divulgar imóveis'
                          : activeTab === 'commissions'
                            ? 'Indicações'
                            : activeTab === 'finance'
                              ? 'Financeiro'
                              : 'Administração'}
                    </h2>
                    <p>
                      {activeTab === 'overview'
                        ? 'Veja seus resultados e escolha o próximo imóvel para divulgar.'
                        : activeTab === 'links'
                          ? 'Encontre um imóvel, gere seu link e compartilhe com seu público.'
                          : activeTab === 'commissions'
                            ? 'Acompanhe suas reservas atribuídas e o andamento das comissões.'
                            : activeTab === 'finance'
                              ? 'Consulte as regras previstas para saldo e repasses.'
                              : 'Gerencie as operações internas do programa de afiliados.'}
                    </p>
                  </div>
                  {activeTab !== 'finance' && activeTab !== 'admin' && (
                    <button
                      className="affiliate-primary"
                      type="button"
                      onClick={() => setActiveTab('links')}
                    >
                      <Link2 size={16} aria-hidden="true" />
                      Criar link
                    </button>
                  )}
                </header>

                {activeTab === 'overview' && (
                  <>
                    <section className="affiliate-welcome">
                      <div>
                        <span className="affiliate-hero-eyebrow">Seu espaço para crescer</span>
                        <h3>Olá, {nickname || 'afiliado'} 👋</h3>
                        <p>
                          Compartilhe imóveis que combinam com seu público e acompanhe cada
                          indicação por aqui.
                        </p>
                        <span className="affiliate-tracking">
                          <span aria-hidden="true" /> Atribuição por 7 dias
                        </span>
                      </div>
                      <div className="affiliate-welcome-art">
                        <Link2 size={72} strokeWidth={1.1} aria-hidden="true" />
                      </div>
                    </section>
                    <section className="affiliate-metrics" aria-label="Resumo de atividade">
                      <article className="affiliate-metric">
                        <span>
                          <MousePointer2 size={17} aria-hidden="true" />
                          Cliques acumulados
                        </span>
                        <strong>{clicks.toLocaleString('pt-BR')}</strong>
                        <small>Desde a criação dos links</small>
                      </article>
                      <article className="affiliate-metric">
                        <span>
                          <ClipboardList size={17} aria-hidden="true" />
                          Reservas nesta página
                        </span>
                        <strong>{localPreview ? '12' : conversions.length}</strong>
                        <small>
                          {localPreview
                            ? 'No período demonstrativo'
                            : `Página ${conversionPage} da lista`}
                        </small>
                      </article>
                      <article className="affiliate-metric">
                        <span>
                          <BadgeDollarSign size={17} aria-hidden="true" />
                          {localPreview
                            ? 'Comissões aprovadas'
                            : 'Aprovado nesta página'}
                        </span>
                        <strong>
                          {localPreview
                            ? 'R$ 486,00'
                            : `R$ ${(conversions.reduce((sum, item) => sum + (item.approved_amount_cents ?? 0), 0) / 100).toFixed(2).replace('.', ',')}`}
                        </strong>
                        <small>
                          {localPreview
                            ? 'Após conclusão da estadia'
                            : 'Soma desta página da lista'}
                        </small>
                      </article>
                    </section>
                    <div className="affiliate-overview-grid">
                      <section className="affiliate-card affiliate-overview-panel affiliate-showcase">
                        <div className="affiliate-card-head">
                          <div>
                            <h3>Comece a divulgar</h3>
                            <p className="affiliate-card-subtitle">
                              Escolha um imóvel para criar seu link de afiliado.
                            </p>
                          </div>
                          <button
                            className="affiliate-secondary"
                            type="button"
                            onClick={() => setActiveTab('links')}
                          >
                            Ver catálogo <ArrowUpRight size={15} aria-hidden="true" />
                          </button>
                        </div>
                        <ul className="affiliate-listing-grid affiliate-listing-grid-compact">
                          {visibleProperties.slice(0, 2).map((property) => (
                            <li key={property.id} className="affiliate-listing">
                              {property.images?.[0] && (
                                <img src={property.images[0]} alt="" loading="lazy" />
                              )}
                              <div className="affiliate-listing-body">
                                <p className="affiliate-listing-title">
                                  {property.title || property.name || property.id}
                                </p>
                                <button
                                  className="affiliate-secondary"
                                  type="button"
                                  onClick={() => {
                                    setSearch(property.title || property.name || property.id);
                                    setActiveTab('links');
                                  }}
                                >
                                  Ver imóvel <ArrowUpRight size={15} aria-hidden="true" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section className="affiliate-card affiliate-overview-panel affiliate-recent">
                        <div className="affiliate-card-head">
                          <div>
                            <h3>Atividade recente</h3>
                            <p className="affiliate-card-subtitle">
                              Atualizações das reservas atribuídas aos seus links.
                            </p>
                          </div>
                          <button
                            className="affiliate-text-button"
                            type="button"
                            onClick={() => setActiveTab('commissions')}
                          >
                            Ver todas
                          </button>
                        </div>
                        {conversions.slice(0, 3).map((item, index) => (
                          <ConversionRow key={`${item.listing_id}-${index}`} item={item} />
                        ))}
                        {conversions.length === 0 && (
                          <p className="affiliate-empty">
                            Quando houver reservas atribuídas, você poderá acompanhá-las aqui.
                          </p>
                        )}
                      </section>
                    </div>
                  </>
                )}

                {activeTab === 'links' && (
                  <section id="affiliate-listings" className="affiliate-card">
                    <div className="affiliate-card-head">
                      <div>
                        <h3>Catálogo de imóveis</h3>
                        <p className="affiliate-card-subtitle">
                          Busque um imóvel e gere um link rastreável para compartilhar.
                        </p>
                      </div>
                    </div>
                    <label>
                      <input
                        className="affiliate-search"
                        aria-label="Buscar imóvel"
                        placeholder="Buscar por nome ou código do imóvel"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    {properties.length === 0 && (
                      <p className="affiliate-empty">Nenhum imóvel disponível no catálogo agora.</p>
                    )}
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
                              <img src={property.images[0]} alt="" loading="lazy" className="" />
                            )}
                            <div className="affiliate-listing-body">
                              <p className="affiliate-listing-title">
                                {property.title || property.name || id}
                              </p>
                              <p className="affiliate-property-note">
                                Preço e disponibilidade são confirmados no site.
                              </p>
                              <div className="affiliate-listing-meta">
                                <span>Link individual</span>
                                {!link && (
                                  <button
                                    className="affiliate-primary"
                                    type="button"
                                    onClick={() => void generateLink(id)}
                                  >
                                    <Link2 size={16} aria-hidden="true" />
                                    Gerar link
                                  </button>
                                )}
                                {link && (
                                  <>
                                    <div className="affiliate-linkbox">
                                      <input aria-label="Seu link" readOnly value={link} />
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
                                        <Copy size={15} aria-hidden="true" />
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
                  </section>
                )}

                {activeTab === 'commissions' && (
                  <section className="affiliate-card">
                    <div className="affiliate-card-head">
                      <div>
                        <h3>Suas reservas indicadas</h3>
                        <p className="affiliate-card-subtitle">
                          Acompanhe o andamento das indicações. Dados do hóspede permanecem
                          privados.
                        </p>
                      </div>
                    </div>
                    <div className="affiliate-filters" aria-label="Filtros de indicações">
                      <label className="affiliate-filter-field">
                        <span>Imóvel</span>
                        <select
                          value={conversionFilters.listingId}
                          onChange={(event) => {
                            setConversionPage(1);
                            setConversionFilters((current) => ({ ...current, listingId: event.target.value }));
                          }}
                        >
                          <option value="">Todos os imóveis</option>
                          {properties.map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.title || property.name || `Imóvel ${property.id}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="affiliate-filter-field">
                        <span>Status da comissão</span>
                        <select
                          value={conversionFilters.commissionStatus}
                          onChange={(event) => {
                            setConversionPage(1);
                            setConversionFilters((current) => ({ ...current, commissionStatus: event.target.value }));
                          }}
                        >
                          <option value="">Todos os status</option>
                          <option value="pending">Pendente</option>
                          <option value="review">Em análise</option>
                          <option value="approved">Aprovada</option>
                          <option value="paid">Paga</option>
                        </select>
                      </label>
                      <label className="affiliate-filter-field">
                        <span>Entrada a partir de</span>
                        <input
                          type="date"
                          value={conversionFilters.from}
                          max={conversionFilters.to || undefined}
                          onChange={(event) => {
                            setConversionPage(1);
                            setConversionFilters((current) => ({ ...current, from: event.target.value }));
                          }}
                        />
                      </label>
                      <label className="affiliate-filter-field">
                        <span>Entrada até</span>
                        <input
                          type="date"
                          value={conversionFilters.to}
                          min={conversionFilters.from || undefined}
                          onChange={(event) => {
                            setConversionPage(1);
                            setConversionFilters((current) => ({ ...current, to: event.target.value }));
                          }}
                        />
                      </label>
                      {hasConversionFilters && (
                        <button
                          className="affiliate-filter-clear"
                          type="button"
                          onClick={() => {
                            setConversionPage(1);
                            setConversionFilters({ listingId: '', commissionStatus: '', from: '', to: '' });
                          }}
                        >
                          Limpar filtros
                        </button>
                      )}
                    </div>
                    <p className="affiliate-filter-hint">O período considera a data de entrada da estadia.</p>
                    <div className="affiliate-commission-legend">
                      <span>
                        <i className="status-dot is-pending" />
                        Em análise
                      </span>
                      <span>
                        <i className="status-dot is-approved" />
                        Aprovada
                      </span>
                      <span>
                        <i className="status-dot is-paid" />
                        Paga
                      </span>
                    </div>
                    {displayedConversions.map((item, index) => (
                      <ConversionRow key={`${item.listing_id}-${index}`} item={item} />
                    ))}
                    {displayedConversions.length === 0 && (
                      <p className="affiliate-empty">
                        {hasConversionFilters
                          ? 'Nenhuma indicação corresponde aos filtros selecionados.'
                          : 'Nenhuma reserva atribuída ainda. Quando houver, ela aparecerá nesta lista.'}
                      </p>
                    )}
                    <AffiliatePagination
                      page={conversionPage}
                      hasMore={conversionMore}
                      onChange={setConversionPage}
                      label="Páginas de reservas e comissões"
                    />
                  </section>
                )}

                {activeTab === 'finance' && (
                  <section className="affiliate-finance-layout">
                    {localPreview ? (
                      <>
                        <div className="affiliate-wallet-card">
                          <span>Saldo disponível demonstrativo</span>
                          <strong>R$ 286,00</strong>
                          <p>
                            Valores fictícios para visualização. Saques ainda não estão conectados a
                            esta prévia.
                          </p>
                          <button className="affiliate-primary" type="button" disabled>
                            Solicitar saque <ArrowUpRight size={15} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="affiliate-finance-details">
                          <article>
                            <Wallet size={19} aria-hidden="true" />
                            <span>Em processamento</span>
                            <strong>R$ 200,00</strong>
                          </article>
                          <article>
                            <BadgeDollarSign size={19} aria-hidden="true" />
                            <span>Taxa por solicitação</span>
                            <strong>R$ 5,00</strong>
                          </article>
                          <article>
                            <ClipboardList size={19} aria-hidden="true" />
                            <span>Saque mínimo</span>
                            <strong>R$ 150,00</strong>
                          </article>
                        </div>
                        <div className="affiliate-finance-notice">
                          <CircleHelp size={19} aria-hidden="true" />
                          <div>
                            <strong>Como funcionam os repasses</strong>
                            <p>
                              O pedido mínimo é de R$ 150. Cada solicitação tem taxa de R$ 5 e os
                              repasses são processados a cada 15 dias, após cadastro e validação dos
                              dados financeiros.
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="affiliate-state-card affiliate-finance-unavailable">
                        <span className="affiliate-state-icon">
                          <Wallet size={21} aria-hidden="true" />
                        </span>
                        <h3>Dados financeiros em preparação</h3>
                        <p>
                          Esta área mostrará seu saldo, extrato e solicitações de saque quando a
                          integração financeira estiver disponível.
                        </p>
                        <p>
                          Regras previstas: saque mínimo de R$ 150, taxa de R$ 5 por solicitação e
                          processamento quinzenal.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'admin' && canManageAffiliateAdmin && session && (
                  <AffiliateAdminPanel token={session.access_token} />
                )}
              </div>
            </div>
          </>
        )}
        {canManageAffiliateAdmin && status !== 'approved' && session && !localPreview && (
          <section className="affiliate-admin-entry">
            <div>
              <p className="affiliate-kicker">Área interna</p>
              <h2>Administração de afiliados</h2>
              <p>Gerencie solicitações, imóveis liberados e revisões de comissão.</p>
            </div>
            <AffiliateAdminPanel token={session.access_token} />
          </section>
        )}
      </div>
    </main>
  );
}
