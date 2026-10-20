import React, { useId, useMemo, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { OwnerDashboardData } from '../../services/crcnBackendApi';
import { useDialogFocus } from '../useDialogFocus';

type AccountingEntry = OwnerDashboardData['entries'][number];
type AccountingProperty = OwnerDashboardData['properties'][number];

interface OwnerAccountingTransactionsProps {
  entries: AccountingEntry[];
  properties: AccountingProperty[];
  period: OwnerDashboardData['period'];
}

const accountingCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const accountingDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value + 'T12:00:00Z'),
  );
};

const csvCell = (value: string): string => '"' + value.replace(/"/g, '""') + '"';

export const OwnerAccountingTransactions: React.FC<OwnerAccountingTransactionsProps> = ({
  entries,
  properties,
  period,
}) => {
  const [listingId, setListingId] = useState('all');
  const [includeDebits, setIncludeDebits] = useState(true);
  const [includeCredits, setIncludeCredits] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<AccountingEntry | null>(null);
  const dialogTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDialog = () => setSelectedEntry(null);
  const dialogRef = useDialogFocus(Boolean(selectedEntry), closeDialog, {
    initialFocusRef: closeButtonRef,
  });

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (listingId === 'all' || entry.listingId === listingId) &&
          ((entry.type === 'debit' && includeDebits) ||
            (entry.type === 'credit' && includeCredits)),
      ),
    [entries, includeCredits, includeDebits, listingId],
  );
  const debitTotal = filteredEntries
    .filter((entry) => entry.type === 'debit')
    .reduce((total, entry) => total + entry.amount, 0);
  const creditTotal = filteredEntries
    .filter((entry) => entry.type === 'credit')
    .reduce((total, entry) => total + entry.amount, 0);

  const downloadCsv = () => {
    const rows = [
      ['Data', 'Anúncio', 'Reserva', 'Descrição', 'Detalhes', 'Débito', 'Crédito'],
      ...filteredEntries.map((entry) => [
        accountingDate(entry.date),
        entry.propertyTitle,
        entry.reservationCode ?? '',
        entry.description,
        entry.publicNote ?? '',
        entry.type === 'debit' ? entry.amount.toFixed(2) : '',
        entry.type === 'credit' ? entry.amount.toFixed(2) : '',
      ]),
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lancamentos-contabeis-' + period.from + '-a-' + period.to + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section aria-labelledby="owner-accounting-entries-title" className="mt-5 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80">
        <header className="flex flex-col justify-between gap-3 border-b border-neutral-200 bg-neutral-50/90 px-4 py-4 sm:flex-row sm:items-center">
          <div>
            <h3 id="owner-accounting-entries-title" className="font-extrabold text-neutral-950">Resultados do filtro</h3>
            <p className="mt-1 text-xs text-neutral-600">
              {accountingDate(period.from)} a {accountingDate(period.to)} · {filteredEntries.length} lançamento(s)
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} aria-label="Imprimir lançamentos contábeis" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
              <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir
            </button>
            <button type="button" onClick={downloadCsv} aria-label="Baixar lançamentos contábeis em CSV" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
              <Download aria-hidden="true" className="h-4 w-4" /> Baixar
            </button>
          </div>
        </header>

        <div className="grid gap-4 border-b border-neutral-200 px-4 py-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-neutral-700">
            Acomodação
            <select value={listingId} onChange={(event) => setListingId(event.target.value)} className="min-h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
              <option value="all">Todas as acomodações</option>
              {properties.map((property) => <option key={property.staysListingId} value={property.staysListingId}>{property.title}</option>)}
            </select>
          </label>
          <fieldset className="flex flex-wrap content-end gap-x-5 gap-y-2">
            <legend className="mb-2 w-full text-xs font-bold text-neutral-700">Tipo</legend>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={includeDebits} onChange={(event) => setIncludeDebits(event.target.checked)} className="h-4 w-4 accent-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200" />
              Débito
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={includeCredits} onChange={(event) => setIncludeCredits(event.target.checked)} className="h-4 w-4 accent-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200" />
              Crédito
            </label>
          </fieldset>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-neutral-600">Nenhum lançamento encontrado para os filtros selecionados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <caption className="sr-only">Lançamentos contábeis do período selecionado</caption>
              <thead className="bg-white text-xs font-bold text-neutral-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Data</th>
                  <th scope="col" className="px-4 py-3">Anúncio</th>
                  <th scope="col" className="px-4 py-3">Reserva</th>
                  <th scope="col" className="px-4 py-3">Descrição</th>
                  <th scope="col" className="px-4 py-3">Info</th>
                  <th scope="col" className="px-4 py-3 text-right">Débito</th>
                  <th scope="col" className="px-4 py-3 text-right">Crédito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{accountingDate(entry.date)}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.propertyTitle}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{entry.reservationCode ?? '—'}</td>
                    <td className="max-w-56 px-4 py-3 text-neutral-700">{entry.description}</td>
                    <td className="px-4 py-3">
                      <button type="button" aria-haspopup="dialog" onClick={() => setSelectedEntry(entry)} className="rounded-md px-2 py-1 font-semibold text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
                        Detalhes
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-800">{entry.type === 'debit' ? accountingCurrency(entry.amount) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-800">{entry.type === 'credit' ? accountingCurrency(entry.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 bg-neutral-50/80 font-bold">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right">Totais no filtro</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{accountingCurrency(debitTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{accountingCurrency(creditTotal)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-4 pb-3 text-right text-neutral-600">Saldo (créditos − débitos)</td>
                  <td colSpan={2} className="px-4 pb-3 text-right">{accountingCurrency(creditTotal - debitTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {selectedEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-neutral-950/60 p-4" data-testid="accounting-entry-overlay">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            data-dialog-focus-root
            tabIndex={-1}
            className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
          >
            <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-700">{selectedEntry.type === 'debit' ? 'Débito' : 'Crédito'} · {accountingDate(selectedEntry.date)}</p>
                <h2 id={dialogTitleId} className="mt-1 text-xl font-extrabold text-neutral-950">Detalhes do lançamento</h2>
                <p className="mt-1 text-sm text-neutral-600">{selectedEntry.description}</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={closeDialog} aria-label="Fechar detalhes" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </header>
            <div className="px-5 py-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-xs font-bold uppercase text-neutral-500">Acomodação</dt><dd className="mt-1 text-sm text-neutral-800">{selectedEntry.propertyTitle}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-500">Valor</dt><dd className="mt-1 text-sm font-semibold text-neutral-900">{accountingCurrency(selectedEntry.amount)}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-500">Situação</dt><dd className="mt-1 text-sm text-neutral-800">{selectedEntry.status || 'Não informada'}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-500">Código da reserva</dt><dd className="mt-1 text-sm text-neutral-800">{selectedEntry.reservationCode ?? 'Sem reserva associada'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-neutral-500">Informação visível ao proprietário</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{selectedEntry.publicNote || 'Nenhuma informação adicional informada.'}</dd></div>
              </dl>
            </div>
            <footer className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
              <button type="button" onClick={closeDialog} className="min-h-10 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">Fechar</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
