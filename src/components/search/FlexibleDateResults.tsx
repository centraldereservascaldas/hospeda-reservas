import { useEffect, useRef, useState } from 'react';
import type { Property, SearchFilters } from '../../types';
import type { AccommodationWidgetSearchParams } from '../../hooks/useAccommodationSearch';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { filterPropertiesBySearchFilters } from '../../utils/propertySearchFilters';
import { getConfirmedPropertyQuote } from '../../utils/propertyDisplayPrice';

interface Period {
  checkIn: string;
  checkOut: string;
  properties: Property[];
  status: 'loading' | 'success' | 'error';
  hasMore: boolean;
  unquoted: number;
  nextSkip: number;
  loadingMore: boolean;
  loadMoreError: boolean;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function FlexibleDateResults({ filters, onOpenProperty }: {
  filters: SearchFilters;
  onOpenProperty: (property: Property, params: AccommodationWidgetSearchParams) => void;
}) {
  const { checkIn, checkOut, destination, destinationPropertyId, dateFlexibility = 0 } = filters;
  const persons = countOccupancyGuests(filters.guests);
  const [periods, setPeriods] = useState<Period[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (!dateFlexibility || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
      setPeriods([]);
      return;
    }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const alternatives = Array.from({ length: dateFlexibility * 2 + 1 }, (_, index) => index - dateFlexibility)
      .filter((offset) => offset !== 0)
      .map((offset): Period => ({ checkIn: shiftDate(checkIn, offset), checkOut: shiftDate(checkOut, offset), properties: [], status: 'loading', hasMore: false, unquoted: 0, nextSkip: 0, loadingMore: false, loadMoreError: false }))
      .filter((period) => period.checkIn >= today);
    const controller = new AbortController();
    controllerRef.current = controller;
    setPeriods(alternatives);
    void (async () => {
      for (const period of alternatives) {
        try {
          const result = await crcnBackendApi.searchAccommodationsPage({ from: period.checkIn, to: period.checkOut, guests: persons, destination, propertyId: destinationPropertyId, limit: 12, skip: 0 }, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setPeriods((current) => current.map((item) => item.checkIn === period.checkIn ? { ...item, properties: result.data, status: 'success', hasMore: result.pagination.hasMore, nextSkip: result.pagination.nextSkip, unquoted: result.unquotedCount } : item));
        } catch {
          if (controller.signal.aborted) return;
          setPeriods((current) => current.map((item) => item.checkIn === period.checkIn ? { ...item, status: 'error' } : item));
        }
      }
    })();
    return () => controller.abort();
  }, [checkIn, checkOut, dateFlexibility, destination, destinationPropertyId, persons, retry]);

  useEffect(() => {
    const deadlines = periods.flatMap((period) => period.properties.map((property) => property.calculatedPrice?.expiresAt).filter((deadline): deadline is number => typeof deadline === 'number' && deadline > Date.now()));
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => setClock((value) => value + 1), Math.max(1, Math.min(...deadlines) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [periods, clock]);

  const loadMore = async (period: Period) => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || period.loadingMore) return;
    setPeriods((current) => current.map((item) => item.checkIn === period.checkIn ? { ...item, loadingMore: true, loadMoreError: false } : item));
    try {
      const result = await crcnBackendApi.searchAccommodationsPage({ from: period.checkIn, to: period.checkOut, guests: persons, destination, propertyId: destinationPropertyId, limit: 12, skip: period.nextSkip }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPeriods((current) => current.map((item) => item.checkIn === period.checkIn && item.checkOut === period.checkOut ? { ...item, properties: [...item.properties, ...result.data.filter((property) => !item.properties.some((existing) => existing.id === property.id))], hasMore: result.pagination.hasMore, nextSkip: result.pagination.nextSkip, unquoted: item.unquoted + result.unquotedCount, loadingMore: false } : item));
    } catch {
      if (controller.signal.aborted) return;
      setPeriods((current) => current.map((item) => item.checkIn === period.checkIn && item.checkOut === period.checkOut ? { ...item, loadingMore: false, loadMoreError: true } : item));
    }
  };

  if (!dateFlexibility || !checkIn || !checkOut || !periods.length) return null;
  return <section className="mb-8" aria-label="Datas alternativas">
    <h2 className="text-xl font-bold text-neutral-900">Datas próximas</h2>
    <p className="mt-1 text-sm text-neutral-600">Mesma duração, com entrada e saída até {dateFlexibility} {dateFlexibility === 1 ? 'dia' : 'dias'} antes ou depois.</p>
    <div className="mt-4 space-y-4" aria-live="polite">
      {periods.map((period) => {
        const properties = filterPropertiesBySearchFilters(period.properties, { ...filters, checkIn: period.checkIn, checkOut: period.checkOut });
        return <div key={period.checkIn} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="font-semibold">{formatDate(period.checkIn)} a {formatDate(period.checkOut)}</h3>
          {period.status === 'loading' && <p className="mt-2 text-sm text-neutral-600">Consultando disponibilidade e preços...</p>}
          {period.status === 'error' && <p className="mt-2 text-sm text-red-700">Não foi possível consultar este período. <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Tentar novamente</button></p>}
          {period.status === 'success' && <>
            {properties.length === 0 && <p className="mt-2 text-sm text-neutral-600">Nenhuma opção confirmada nesta página para os filtros selecionados.</p>}
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{properties.map((property) => {
              const quote = getConfirmedPropertyQuote(property);
              return <button key={property.id} type="button" disabled={!quote} onClick={() => onOpenProperty(property, { checkIn: period.checkIn, checkOut: period.checkOut, persons, guests: filters.guests, destination, propertyId: destinationPropertyId })} className="rounded-xl border border-neutral-200 p-3 text-left hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-60">
                <span className="block font-semibold">{property.title}</span>
                <span className="block text-sm text-neutral-600">{formatDate(period.checkIn)} a {formatDate(period.checkOut)}</span>
                <span className="mt-1 block text-sm font-bold">{quote ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.totalAmount)} total` : 'Cotação expirada'}</span>
              </button>;
            })}</div>
            {period.hasMore && <button type="button" disabled={period.loadingMore} onClick={() => void loadMore(period)} className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-60">{period.loadingMore ? 'Carregando...' : 'Ver mais acomodações neste período'}</button>}
            {period.loadMoreError && <p className="mt-2 text-sm text-red-700">Não foi possível carregar mais acomodações. Tente novamente.</p>}
            {period.unquoted > 0 && <p className="mt-2 text-xs text-neutral-600">Algumas acomodações não tiveram preço confirmado.</p>}
          </>}
        </div>;
      })}
    </div>
  </section>;
}
