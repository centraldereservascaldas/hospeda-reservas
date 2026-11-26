import { useEffect, useRef, useState } from 'react';
import type { Property } from '../types';
import { apiFetch } from '../services/apiFetch';
import { isProperty, isRecord } from '../utils/apiValidation';
import { PropertyDetailModal } from './property/PropertyDetailModal';
import { parseSearchFilters } from '../utils/searchUrlState';
import { countOccupancyGuests } from '../utils/guestCounts';

const pendingSearches = new Map<string, Promise<unknown>>();

function fetchOffers(query: string): Promise<unknown> {
  const pending = pendingSearches.get(query);
  if (pending) return pending;
  const request = apiFetch('/api/imobsys/offers?' + query)
    .then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
      return response.json() as Promise<unknown>;
    })
    .finally(() => pendingSearches.delete(query));
  pendingSearches.set(query, request);
  return request;
}

export default function ImobSysPropertyPage() {
  const id = window.location.pathname.split('/')[2].replace(/^parceiro-crcn-/, 'imobsys-crcn-');
  const [initialContext] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const filters = parseSearchFilters(window.location.search);
    return {
      from: filters.checkIn,
      to: filters.checkOut,
      guests: Number(params.get('guests') || countOccupancyGuests(filters.guests)),
    };
  });
  const { from, to, guests } = initialContext;
  const [property, setProperty] = useState<Property | null>(null);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState({ from, to, guests });
  const [searchState, setSearchState] = useState({ loading: false, message: '' });
  const searchGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++searchGeneration.current;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      to <= from ||
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 10
    ) {
      setStatus('error');
      setMessage('Selecione datas e hóspedes na busca para consultar este imóvel.');
      return () => controller.abort();
    }
    const query = new URLSearchParams({ from, to, guests: String(guests), propertyId: id });
    void fetchOffers(query.toString())
      .then((body) => {
        if (controller.signal.aborted || generation !== searchGeneration.current) return;
        if (!isRecord(body) || !Array.isArray(body.data))
          throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
        const found = body.data.find((item: unknown) => isProperty(item) && item.id === id);
        if (!isProperty(found))
          throw new Error('Esta oferta não foi encontrada para as datas e hóspedes selecionados.');
        setProperty(found);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== searchGeneration.current) return;
        setMessage(
          error instanceof Error ? error.message : 'Não foi possível consultar este imóvel.',
        );
        setStatus('error');
      });
    return () => {
      controller.abort();
      searchGeneration.current += 1;
    };
  }, [id, from, to, guests]);

  async function searchProperty(
    nextFrom: string,
    nextTo: string,
    nextGuests: number,
  ): Promise<void> {
    const generation = ++searchGeneration.current;
    if (nextTo <= nextFrom) {
      setSearchState({ loading: false, message: 'A saída precisa ser depois da entrada.' });
      return;
    }
    setSearchState({ loading: true, message: '' });
    try {
      const query = new URLSearchParams({
        from: nextFrom,
        to: nextTo,
        guests: String(nextGuests),
        propertyId: id,
      });
      const body = await fetchOffers(query.toString());
      if (generation !== searchGeneration.current) return;
      if (!isRecord(body) || !Array.isArray(body.data))
        throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
      const found = body.data.find((item: unknown) => isProperty(item) && item.id === id);
      if (!isProperty(found)) {
        setSearchState({
          loading: false,
          message:
            'Não encontramos uma oferta para este imóvel nas datas e quantidade de hóspedes escolhidas. Tente outra pesquisa.',
        });
        return;
      }
      setProperty(found);
      setContext({ from: nextFrom, to: nextTo, guests: nextGuests });
      const url = new URL(window.location.href);
      url.searchParams.set('checkin', nextFrom);
      url.searchParams.set('checkout', nextTo);
      url.searchParams.set('guests', String(nextGuests));
      window.history.replaceState(window.history.state, '', url);
      setSearchState({ loading: false, message: '' });
    } catch {
      if (generation !== searchGeneration.current) return;
      setSearchState({
        loading: false,
        message: 'Não foi possível consultar a oferta agora. Tente novamente.',
      });
    }
  }

  if (!property)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <a href="/" className="text-orange-700 underline">
          Voltar à busca de hospedagens
        </a>
        {status === 'loading' ? (
          <p role="status" className="mt-6">
            Consultando o imóvel e as datas…
          </p>
        ) : (
          <p role="alert" className="mt-6">
            {message}
          </p>
        )}
      </main>
    );

  return (
    <PropertyDetailModal
      property={property}
      initialCheckIn={context.from}
      initialCheckOut={context.to}
      initialGuests={{ adults: context.guests, children: 0, infants: 0, pets: 0 }}
      onClose={() => {
        window.location.href = '/';
      }}
      currency="BRL"
      isSaved={false}
      onToggleSave={() => {}}
      onStartBooking={() => {}}
      presentation="page"
      onImobSysSearch={searchProperty}
      imobSysSearchState={searchState}
    />
  );
}
