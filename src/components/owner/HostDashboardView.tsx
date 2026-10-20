import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Home, LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { OwnerDashboardData } from '../../services/crcnBackendApi';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { OwnerAccountingTransactions } from './OwnerAccountingTransactions';

type DashboardSection = 'overview' | 'properties' | 'reservations' | 'calendar' | 'accounting';

interface HostDashboardViewProps {
  accessToken: string;
}

const currencyText = (value: number, currency: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'BRL', maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

const dateText = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
};

const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from, to };
};

const statusLabel: Record<string, string> = {
  confirmed: 'Confirmada', cancelled: 'Cancelada', blocked: 'Bloqueio', other: 'Outra',
};

const paymentStatusLabel: Record<string, string> = {
  paid: 'Pagamento confirmado',
  partial: 'Pagamento parcial',
  unpaid: 'Sem pagamento',
  unknown: 'Pagamento não informado',
};

const calendarEntryClass = (reservation: OwnerDashboardData['reservations'][number]): string => {
  if (reservation.status === 'blocked') return 'bg-red-100 text-red-800';
  if (reservation.status === 'cancelled') return 'bg-neutral-100 text-neutral-500 line-through';
  if (reservation.paymentStatus === 'paid' || reservation.paymentStatus === 'partial') return 'bg-blue-100 text-blue-800';
  if (reservation.status === 'confirmed') return 'bg-amber-100 text-amber-900';
  return 'bg-neutral-100 text-neutral-700';
};

export const HostDashboardView: React.FC<HostDashboardViewProps> = ({ accessToken }) => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [section, setSection] = useState<DashboardSection>('overview');
  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockListingId, setBlockListingId] = useState('');
  const [blockFrom, setBlockFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [blockTo, setBlockTo] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [blockReason, setBlockReason] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [blockSuccess, setBlockSuccess] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { from, to } = monthBounds(month);
      const data = await crcnBackendApi.getOwnerDashboard(accessToken, from, to);
      setDashboard(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados do proprietário.');
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, month]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const confirmed = dashboard?.reservations.filter((reservation) => reservation.status === 'confirmed') || [];
  const upcoming = confirmed.filter((reservation) => reservation.checkOut >= new Date().toISOString().slice(0, 10));
  const reservations = dashboard?.reservations || [];
  const monthTitle = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  }, [month]);

  const changeMonth = (amount: number) => {
    const [year, monthNumber] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7));
  };

  const tabs: Array<{ id: DashboardSection; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Visão geral', icon: <Home className="h-4 w-4" /> },
    { id: 'properties', label: 'Minhas propriedades', icon: <Home className="h-4 w-4" /> },
    { id: 'reservations', label: 'Minhas reservas', icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'calendar', label: 'Calendário', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'accounting', label: 'Contabilidade', icon: <CircleDollarSign className="h-4 w-4" /> },
  ];

  const calendarDays = useMemo(() => {
    const { from } = monthBounds(month);
    const [year, monthNumber] = month.split('-').map(Number);
    const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
    const offset = (firstDay.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(year, monthNumber - 1, 1 - offset));
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start.getTime() + index * 86400000);
      const iso = day.toISOString().slice(0, 10);
      return { iso, number: day.getUTCDate(), inMonth: iso.slice(0, 7) === from.slice(0, 7) };
    });
  }, [month]);

  return (
    <div className="mx-auto min-h-[75vh] max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 border-b border-white/70 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-950 sm:text-3xl">Painel do proprietário</h1>
          <p className="mt-1 text-sm text-neutral-600">{dashboard?.ownerName ? `Olá, ${dashboard.ownerName}. ` : ''}Consulte propriedades, reservas e valores do período.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-sm backdrop-blur-xl sm:self-auto">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="rounded-xl p-2 hover:bg-white"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-36 text-center text-sm font-bold capitalize text-neutral-800">{monthTitle}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês" className="rounded-xl p-2 hover:bg-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/80 bg-white/55 p-2 backdrop-blur-xl" aria-label="Seções do painel do proprietário">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" aria-current={section === tab.id ? 'page' : undefined} onClick={() => setSection(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${section === tab.id ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20' : 'text-neutral-700 hover:bg-white/90'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" onClick={() => void loadDashboard()} className="inline-flex items-center gap-2 self-start rounded-xl border border-rose-200 bg-white px-3 py-2 font-bold"><RefreshCw className="h-4 w-4" /> Tentar novamente</button></div>}

      {loading ? (
        <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center rounded-3xl border border-white/70 bg-white/55 text-sm font-semibold text-neutral-600 backdrop-blur-xl"><LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 animate-spin text-orange-600" />Carregando dados da Stays…</div>
      ) : dashboard && (
        <>
          {section === 'overview' && <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Propriedades vinculadas" value={String(dashboard.properties.length)} icon={<Home className="h-5 w-5" />} />
              <Metric label="Reservas confirmadas no período" value={String(confirmed.length)} icon={<CalendarDays className="h-5 w-5" />} />
              <Metric label="Créditos no período" value={currencyText(dashboard.totals.credit, 'BRL')} icon={<CircleDollarSign className="h-5 w-5" />} />
              <Metric label="Débitos no período" value={currencyText(dashboard.totals.debit, 'BRL')} icon={<CircleDollarSign className="h-5 w-5" />} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard title="Próximas estadias" detail={`${upcoming.length} reserva(s) confirmada(s) com checkout a partir de hoje`}>
                <ReservationList rows={upcoming.slice(0, 5)} />
              </SectionCard>
              <SectionCard title="Suas propriedades" detail={`${dashboard.properties.length} propriedade(s) associada(s) ao seu acesso`}>
                <PropertyList rows={dashboard.properties.slice(0, 5)} />
              </SectionCard>
            </div>
          </>}

          {section === 'properties' && <SectionCard title="Minhas propriedades" detail="Imóveis vinculados ao seu perfil de proprietário na Stays."><PropertyList rows={dashboard.properties} /></SectionCard>}

          {section === 'reservations' && <SectionCard title="Minhas reservas" detail="Reservas, cancelamentos e bloqueios incluídos no período selecionado."><ReservationList rows={reservations} /></SectionCard>}

          {section === 'accounting' && <SectionCard title="Minha contabilidade" detail={`Totais informados pela Stays para ${monthTitle}. Os valores não são estimativas.`}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <AmountCard label="Créditos" value={currencyText(dashboard.totals.credit, 'BRL')} tone="emerald" />
              <AmountCard label="Débitos" value={currencyText(dashboard.totals.debit, 'BRL')} tone="orange" />
              <AmountCard label="Saldo (créditos − débitos)" value={currencyText(dashboard.totals.credit - dashboard.totals.debit, 'BRL')} tone="neutral" />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-neutral-200/80">
              <table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="px-4 py-3">Propriedade</th><th className="px-4 py-3 text-right">Créditos</th><th className="px-4 py-3 text-right">Débitos</th></tr></thead><tbody className="divide-y divide-neutral-100 bg-white/80">{dashboard.properties.map((property) => <tr key={property.staysListingId}><td className="px-4 py-3 font-semibold text-neutral-800">{property.title}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{currencyText(property.credit, 'BRL')}</td><td className="px-4 py-3 text-right font-bold text-orange-700">{currencyText(property.debit, 'BRL')}</td></tr>)}</tbody></table>
            </div>
            <OwnerAccountingTransactions entries={dashboard.entries} properties={dashboard.properties} period={dashboard.period} />
          </SectionCard>}

          {section === 'calendar' && <SectionCard title="Calendário de reservas" detail="Consulte reservas e bloqueios sincronizados com a Stays e bloqueie períodos dos seus imóveis.">
            <form
              className="mb-5 grid gap-3 rounded-2xl border border-orange-100 bg-orange-50/55 p-4 sm:grid-cols-2 lg:grid-cols-5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!dashboard?.properties.length) return;
                setBlockSaving(true);
                setBlockError('');
                setBlockSuccess('');
                try {
                  await crcnBackendApi.createOwnerCalendarBlock(accessToken, {
                    listingId: blockListingId || dashboard.properties[0]!.staysListingId,
                    from: blockFrom,
                    to: blockTo,
                    ...(blockReason.trim() ? { reason: blockReason.trim() } : {}),
                  });
                  setBlockSuccess('As datas foram bloqueadas na Stays.');
                  setBlockReason('');
                  if (month === blockFrom.slice(0, 7)) {
                    await loadDashboard();
                  } else {
                    setMonth(blockFrom.slice(0, 7));
                  }
                } catch (blockRequestError) {
                  setBlockError(blockRequestError instanceof Error ? blockRequestError.message : 'Não foi possível bloquear essas datas.');
                } finally {
                  setBlockSaving(false);
                }
              }}
            >
              <label className="grid gap-1 text-xs font-bold text-neutral-700 sm:col-span-2 lg:col-span-1">
                Propriedade
                <select
                  value={blockListingId || dashboard.properties[0]?.staysListingId || ''}
                  onChange={(event) => setBlockListingId(event.target.value)}
                  required
                  disabled={dashboard.properties.length === 0 || blockSaving}
                  className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                >
                  {dashboard.properties.map((property) => <option key={property.staysListingId} value={property.staysListingId}>{property.title}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-neutral-700">
                Primeira data bloqueada
                <input type="date" value={blockFrom} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setBlockFrom(event.target.value)} required disabled={blockSaving} className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-neutral-700">
                Data de liberação
                <input type="date" value={blockTo} min={blockFrom} onChange={(event) => setBlockTo(event.target.value)} required disabled={blockSaving} className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-neutral-700 sm:col-span-2 lg:col-span-1">
                Motivo (opcional)
                <input type="text" value={blockReason} maxLength={140} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: uso pessoal ou manutenção" disabled={blockSaving} className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium outline-none placeholder:font-normal focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-1">
                <button type="submit" disabled={blockSaving || dashboard.properties.length === 0} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-extrabold text-white shadow-md shadow-orange-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                  {blockSaving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                  {blockSaving ? 'Bloqueando…' : 'Bloquear datas'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600 sm:col-span-2 lg:col-span-5">A data de liberação funciona como checkout: ela não fica bloqueada. O bloqueio será aplicado à disponibilidade real na Stays.</p>
              {blockError && <p role="alert" className="text-xs font-semibold text-rose-700 sm:col-span-2 lg:col-span-5">{blockError}</p>}
              {blockSuccess && <p role="status" className="text-xs font-semibold text-emerald-700 sm:col-span-2 lg:col-span-5">{blockSuccess}</p>}
            </form>
            {dashboard.properties.length === 0 && <EmptyState message="Não há imóveis vinculados para bloquear datas." />}
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-neutral-700" aria-label="Legenda do calendário">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />Bloqueio</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden="true" />Reserva com pagamento</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />Reserva sem pagamento confirmado</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => <div key={day} className="pb-2 text-center text-xs font-bold text-neutral-500">{day}</div>)}
              {calendarDays.map((day) => {
                const stays = reservations.filter((reservation) => reservation.checkIn <= day.iso && reservation.checkOut > day.iso);
                return <div key={day.iso} className={`min-h-20 rounded-xl border p-1.5 sm:min-h-24 sm:p-2 ${day.inMonth ? 'border-white/90 bg-white/75' : 'border-transparent bg-white/30 text-neutral-400'}`}>
                  <span className="text-xs font-bold">{day.number}</span>
                  <div className="mt-1 space-y-1">{stays.slice(0, 2).map((stay) => <div key={`${day.iso}-${stay.id}`} title={`${stay.propertyTitle} · ${statusLabel[stay.status]} · ${paymentStatusLabel[stay.paymentStatus]}`} className={`truncate rounded-md px-1 py-0.5 text-[9px] font-bold sm:text-[10px] ${calendarEntryClass(stay)}`}>{stay.propertyTitle}</div>)}{stays.length > 2 && <div className="text-[9px] font-semibold text-neutral-500">+{stays.length - 2}</div>}</div>
                </div>;
              })}
            </div>
            <p className="mt-3 text-xs text-neutral-500">As reservas e bloqueios exibidos vêm da Stays. Bloqueios criados aqui afetam a disponibilidade do imóvel nos canais integrados.</p>
          </SectionCard>}

          <p className="text-center text-xs text-neutral-500">Informações consultadas na Stays · período de {dateText(dashboard.period.from)} a {dateText(dashboard.period.to)}</p>
        </>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><div className="mb-3 flex items-center justify-between text-neutral-500"><span className="text-xs font-bold">{label}</span><span className="text-orange-600">{icon}</span></div><p className="break-words text-2xl font-black text-neutral-950">{value}</p></div>;

const SectionCard: React.FC<{ title: string; detail: string; children: React.ReactNode }> = ({ title, detail, children }) => <section className="rounded-3xl border border-white/80 bg-white/60 p-4 shadow-sm backdrop-blur-xl sm:p-6"><div className="mb-4"><h2 className="text-lg font-extrabold text-neutral-950">{title}</h2><p className="mt-1 text-xs text-neutral-500">{detail}</p></div>{children}</section>;

const PropertyList: React.FC<{ rows: OwnerDashboardData['properties'] }> = ({ rows }) => rows.length ? <div className="divide-y divide-neutral-100">{rows.map((property) => <div key={property.staysListingId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="h-14 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">{property.image && <img src={property.image} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-neutral-900">{property.title}</p><p className="text-xs text-neutral-500">Código {property.staysListingId}</p></div></div>)}</div> : <EmptyState message="Nenhuma propriedade foi retornada para este perfil neste período." />;

const ReservationList: React.FC<{ rows: OwnerDashboardData['reservations'] }> = ({ rows }) => rows.length ? <div className="divide-y divide-neutral-100">{rows.map((reservation) => {
  const isPreReservation = reservation.status === 'confirmed' && reservation.paymentStatus !== 'paid' && reservation.paymentStatus !== 'partial';
  const badgeLabel = isPreReservation ? 'Pré-reserva' : statusLabel[reservation.status];

  return <div key={reservation.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-neutral-900">{reservation.guestName}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${calendarEntryClass(reservation)}`}>{badgeLabel}</span></div><p className="mt-1 truncate text-xs text-neutral-600">{reservation.propertyTitle} · {dateText(reservation.checkIn)} a {dateText(reservation.checkOut)} · {reservation.nights} noite(s)</p><p className="text-[11px] text-neutral-400">Reserva {reservation.code}</p></div><p className="shrink-0 text-sm font-extrabold text-neutral-900">{currencyText(reservation.total, reservation.currency)}</p></div>;
})}</div> : <EmptyState message="Nenhuma reserva foi retornada para este período." />;

const AmountCard: React.FC<{ label: string; value: string; tone: 'emerald' | 'orange' | 'neutral' }> = ({ label, value, tone }) => <div className={`rounded-2xl border p-4 ${tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/70' : tone === 'orange' ? 'border-orange-200 bg-orange-50/70' : 'border-neutral-200 bg-white/80'}`}><p className="text-xs font-semibold text-neutral-600">{label}</p><p className="mt-1 text-lg font-black text-neutral-950">{value}</p></div>;

const EmptyState: React.FC<{ message: string }> = ({ message }) => <p className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 p-5 text-center text-sm text-neutral-500">{message}</p>;
