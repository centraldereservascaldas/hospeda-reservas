import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, LoaderCircle, Printer, X } from 'lucide-react';
import type { OwnerAccountingDetails, OwnerDashboardData } from '../../services/crcnBackendApi';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { useDialogFocus } from '../useDialogFocus';

type Entry = OwnerDashboardData['entries'][number];

interface OwnerAccountingTransactionsProps {
  accessToken: string;
  entries: Entry[];
  properties: OwnerDashboardData['properties'];
  period: OwnerDashboardData['period'];
}

const currency = (amount: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
const date = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${value}T12:00:00Z`),
      )
    : '—';
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const OwnerAccountingTransactions: React.FC<OwnerAccountingTransactionsProps> = ({
  accessToken,
  entries,
  properties,
  period,
}) => {
  const [listingId, setListingId] = useState('all');
  const [includeDebits, setIncludeDebits] = useState(true);
  const [includeCredits, setIncludeCredits] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [details, setDetails] = useState<OwnerAccountingDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequestGenerationRef = useRef(0);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const currentContextId = `${accessToken}\u0000${period.from}\u0000${period.to}`;
  const hasCurrentSelection = selectedEntry !== null && selectedContextId === currentContextId;
  const close = () => {
    detailRequestGenerationRef.current += 1;
    setSelectedEntry(null);
    setSelectedContextId(null);
    setDetails(null);
    setDetailError('');
    setDetailLoading(false);
  };
  const dialogRef = useDialogFocus(hasCurrentSelection, close, { initialFocusRef: closeRef });

  useEffect(() => {
    detailRequestGenerationRef.current += 1;
    setSelectedEntry(null);
    setSelectedContextId(null);
    setDetails(null);
    setDetailError('');
    setDetailLoading(false);

    return () => {
      detailRequestGenerationRef.current += 1;
    };
  }, [accessToken, period.from, period.to]);
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (listingId === 'all' || entry.listingId === listingId) &&
          ((entry.type === 'debit' && includeDebits) ||
            (entry.type === 'credit' && includeCredits)),
      ),
    [entries, includeCredits, includeDebits, listingId],
  );
  const debitTotal = visibleEntries
    .filter((entry) => entry.type === 'debit')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const creditTotal = visibleEntries
    .filter((entry) => entry.type === 'credit')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const openDetails = async (entry: Entry) => {
    const requestGeneration = detailRequestGenerationRef.current + 1;
    detailRequestGenerationRef.current = requestGeneration;
    setSelectedEntry(entry);
    setSelectedContextId(currentContextId);
    setDetails(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await crcnBackendApi.getOwnerAccountingDetails(
        accessToken,
        entry.id,
        entry.listingId,
        period.from,
        period.to,
      );
      if (requestGeneration !== detailRequestGenerationRef.current) return;
      setDetails(result);
    } catch (error) {
      if (requestGeneration !== detailRequestGenerationRef.current) return;
      setDetailError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os detalhes deste lançamento.',
      );
    } finally {
      if (requestGeneration === detailRequestGenerationRef.current) {
        setDetailLoading(false);
      }
    }
  };

  const downloadCsv = () => {
    const rows = [
      ['Data', 'Anúncio', 'Reserva', 'Descrição', 'Detalhes', 'Débito', 'Crédito'],
      ...visibleEntries.map((entry) => [
        date(entry.date),
        entry.propertyTitle,
        entry.reservationCode ?? '',
        entry.description,
        entry.publicNote ?? '',
        entry.type === 'debit' ? entry.amount.toFixed(2) : '',
        entry.type === 'credit' ? entry.amount.toFixed(2) : '',
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `lancamentos-${period.from}-a-${period.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section
        aria-labelledby="accounting-entries-title"
        className="mt-5 overflow-hidden rounded-2xl border border-white/80 bg-white/70 shadow-sm"
      >
        <header className="flex flex-col justify-between gap-3 border-b border-neutral-200/80 px-4 py-4 sm:flex-row sm:items-center">
          <div>
            <h3 id="accounting-entries-title" className="font-extrabold text-neutral-950">
              Resultados do filtro
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              {date(period.from)} a {date(period.to)} · {visibleEntries.length} lançamento(s)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white/80 px-3 text-xs font-bold text-neutral-700 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              Relatório completo
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              aria-label="Baixar lançamentos em CSV"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white/80 px-3 text-neutral-700 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="grid gap-4 border-b border-neutral-200/80 px-4 py-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-neutral-700">
            Anúncio
            <select
              value={listingId}
              onChange={(event) => setListingId(event.target.value)}
              className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            >
              <option value="all">Todos os anúncios</option>
              {properties.map((property) => (
                <option key={property.staysListingId} value={property.staysListingId}>
                  {property.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap content-end gap-x-5 gap-y-2">
            <legend className="mb-2 w-full text-xs font-bold text-neutral-700">
              Exibir lançamentos
            </legend>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={includeDebits}
                onChange={(event) => setIncludeDebits(event.target.checked)}
                className="h-4 w-4 accent-orange-600"
              />
              Débitos
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={includeCredits}
                onChange={(event) => setIncludeCredits(event.target.checked)}
                className="h-4 w-4 accent-orange-600"
              />
              Créditos
            </label>
          </fieldset>
        </div>
        {visibleEntries.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-neutral-500">
            Nenhum lançamento encontrado para os filtros selecionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <caption className="sr-only">Lançamentos financeiros no período selecionado</caption>
              <thead className="bg-white/50 text-xs font-bold text-neutral-500">
                <tr>
                  {['Data', 'Anúncio', 'Reserva', 'Descrição', 'Info'].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right">
                    Débito
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Crédito
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                      {date(entry.date)}
                    </td>
                    <td
                      className="max-w-48 truncate px-4 py-3 text-neutral-700"
                      title={entry.propertyTitle}
                    >
                      {entry.propertyTitle}
                    </td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">
                      {entry.reservationCode ?? '—'}
                    </td>
                    <td
                      className="max-w-56 truncate px-4 py-3 text-neutral-700"
                      title={entry.description}
                    >
                      {entry.description}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => void openDetails(entry)}
                        className="rounded-md px-2 py-1 font-semibold text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                      >
                        Detalhes
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-800">
                      {entry.type === 'debit' ? currency(entry.amount) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-800">
                      {entry.type === 'credit' ? currency(entry.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 bg-white/50 font-bold">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right">
                    Totais do filtro
                  </td>
                  <td className="px-4 py-3 text-right">{currency(debitTotal)}</td>
                  <td className="px-4 py-3 text-right">{currency(creditTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      {hasCurrentSelection &&
        selectedEntry &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-white/20 p-3 backdrop-blur-[2px] sm:p-5"
            data-testid="accounting-entry-overlay"
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-dialog-focus-root
              tabIndex={-1}
              className="liquid-glass-card my-auto w-full max-w-2xl overflow-hidden rounded-3xl !bg-white/80 !shadow-[0_36px_110px_-16px_rgba(15,23,42,0.4),0_16px_42px_-12px_rgba(15,23,42,0.28)] outline outline-1 outline-white/90"
            >
              <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/75 bg-white/70 px-5 py-4 backdrop-blur-xl">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                    {details?.reservationCode || selectedEntry.reservationCode
                      ? `Reserva · ${details?.reservationCode || selectedEntry.reservationCode}`
                      : 'Lançamento'}{' '}
                    · {date(selectedEntry.date)}
                  </p>
                  <h2 id={titleId} className="mt-1 text-lg font-extrabold text-neutral-950">
                    Detalhes do lançamento
                  </h2>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label="Fechar detalhes"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/55 text-neutral-600 shadow-sm backdrop-blur-md hover:bg-white/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </header>
              <div className="space-y-6 px-5 py-5">
                {detailLoading && (
                  <p role="status" className="flex items-center gap-2 text-sm text-neutral-600">
                    <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                    Consultando detalhes na Stays…
                  </p>
                )}
                {detailError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                  >
                    {detailError}
                  </p>
                )}
                {!detailLoading && !detailError && details && (
                  <>
                    <section>
                      <h3 className="mb-3 text-sm font-extrabold text-neutral-950">Reserva</h3>
                      <dl className="grid gap-x-8 gap-y-4 border-b border-neutral-200/80 pb-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-bold text-neutral-500">
                            Código da reserva na Stays
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-neutral-800">
                            {details.reservationCode || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold text-neutral-500">Hóspede</dt>
                          <dd className="mt-1 text-sm text-neutral-800">
                            {details.guestName || 'Hóspede'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold text-neutral-500">Período</dt>
                          <dd className="mt-1 text-sm text-neutral-800">
                            {details.nights} noite(s)
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-bold text-neutral-500">
                            Check-in / Checkout
                          </dt>
                          <dd className="mt-1 text-sm text-neutral-800">
                            {date(details.checkIn)} – {date(details.checkOut)}
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <section>
                      <h3 className="mb-2 text-sm font-extrabold text-neutral-950">
                        {details.ledgerEntry.type === 'credit'
                          ? 'Valores do repasse'
                          : 'Composição do lançamento'}
                      </h3>
                      <div className="divide-y divide-neutral-200/80 border-y border-neutral-200/80">
                        {details.fees.length ? (
                          details.fees.map((fee, index) => (
                            <div
                              key={`${fee.label}-${index}`}
                              className="flex justify-between gap-4 px-2 py-2.5 text-sm"
                            >
                              <span className="font-semibold text-neutral-600">{fee.label}</span>
                              <span className="shrink-0 text-neutral-700">
                                − {currency(Math.abs(fee.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="px-2 py-3 text-sm text-neutral-500">
                            {details.ledgerEntry.type === 'credit'
                              ? 'A API da Stays não retornou a discriminação das taxas do repasse.'
                              : 'A API da Stays não retornou a discriminação deste lançamento.'}
                          </p>
                        )}
                        {details.ledgerEntry.type === 'credit' && (
                          <div className="flex justify-between gap-4 px-2 py-2.5 text-sm font-extrabold">
                            <span>Crédito líquido ao proprietário</span>
                            <span>{currency(details.payout)}</span>
                          </div>
                        )}
                      </div>
                    </section>
                    <section>
                      <h3 className="mb-2 text-sm font-extrabold text-neutral-950">
                        Lançamento financeiro
                      </h3>
                      <div className="divide-y divide-neutral-200/80 border-y border-neutral-200/80">
                        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-2 py-2.5 text-sm">
                          <span className="text-neutral-600">
                            {date(details.ledgerEntry.date)} ·{' '}
                            {details.ledgerEntry.type === 'credit' ? 'Crédito' : 'Débito'}
                            {details.ledgerEntry.status ? ` · ${details.ledgerEntry.status}` : ''}
                            {details.ledgerEntry.description
                              ? ` · ${details.ledgerEntry.description}`
                              : ''}
                          </span>
                          <span className="font-semibold">
                            {currency(details.ledgerEntry.amount)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 px-2 py-2.5 text-sm font-extrabold">
                          <span>Valor do lançamento</span>
                          <span>{currency(details.ledgerEntry.amount)}</span>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>
              <footer className="flex justify-end border-t border-white/60 bg-white/35 px-5 py-3 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-10 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                >
                  Fechar
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
