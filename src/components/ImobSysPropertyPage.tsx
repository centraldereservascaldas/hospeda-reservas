import { useEffect, useState } from 'react';
import type { Property } from '../types';
import { apiFetch } from '../services/apiFetch';
import { isProperty, isRecord } from '../utils/apiValidation';
import { PropertyDetailModal } from './property/PropertyDetailModal';

const pendingSearches = new Map<string, Promise<unknown>>();

function fetchOffers(query: string): Promise<unknown> {
  const pending = pendingSearches.get(query);
  if (pending) return pending;
  const request = apiFetch('/api/imobsys/offers?' + query).then(async (response) => {
    if (!response.ok) throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
    return response.json() as Promise<unknown>;
  }).finally(() => pendingSearches.delete(query));
  pendingSearches.set(query, request);
  return request;
}

export default function ImobSysPropertyPage() {
  const id = window.location.pathname.split('/')[2].replace(/^parceiro-crcn-/, 'imobsys-crcn-');
  const [initialContext] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { from: params.get('checkin') || '', to: params.get('checkout') || '', guests: Number(params.get('guests') || '2') };
  });
  const { from, to, guests } = initialContext;
  const [property, setProperty] = useState<Property | null>(null);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState({ from, to, guests });
  const [searchState, setSearchState] = useState({ loading: false, message: '' });

  useEffect(() => {
    const controller = new AbortController();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from || !Number.isInteger(guests) || guests < 2 || guests > 10) {
      setStatus('error');
      setMessage('Selecione datas e hóspedes na busca para consultar este imóvel.');
      return () => controller.abort();
    }
    const query = new URLSearchParams({ from, to, guests: String(guests), propertyId: id });
    void fetchOffers(query.toString())
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!isRecord(body) || !Array.isArray(body.data)) throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
        const found = body.data.find((item: unknown) => isProperty(item) && item.id === id);
        if (!isProperty(found)) throw new Error('Esta oferta não foi encontrada para as datas e hóspedes selecionados.');
        setProperty(found);
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : 'Não foi possível consultar este imóvel.');
        setStatus('error');
      });
    return () => controller.abort();
  }, [id, from, to, guests]);

  async function searchProperty(nextFrom: string, nextTo: string, nextGuests: number): Promise<void> {
    if (nextTo <= nextFrom) {
      setSearchState({ loading: false, message: 'A saída precisa ser depois da entrada.' });
      return;
    }
    setSearchState({ loading: true, message: '' });
    try {
      const query = new URLSearchParams({ from: nextFrom, to: nextTo, guests: String(nextGuests), propertyId: id });
      const body = await fetchOffers(query.toString());
      if (!isRecord(body) || !Array.isArray(body.data)) throw new Error('Não foi possível consultar o imóvel do parceiro agora.');
      const found = body.data.find((item: unknown) => isProperty(item) && item.id === id);
      if (!isProperty(found)) {
        setSearchState({ loading: false, message: 'Não encontramos uma oferta para este imóvel nas datas e quantidade de hóspedes escolhidas. Tente outra pesquisa.' });
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
      setSearchState({ loading: false, message: 'Não foi possível consultar a oferta agora. Tente novamente.' });
    }
  }

  if (!property) return <main className="mx-auto max-w-3xl p-6">
    <a href="/parceiros" className="text-orange-700 underline">Voltar à busca de parceiros</a>
    {status === 'loading' ? <p role="status" className="mt-6">Consultando o imóvel e as datas…</p> : <p role="alert" className="mt-6">{message}</p>}
  </main>;

  return <PropertyDetailModal
    property={property}
    initialCheckIn={context.from}
    initialCheckOut={context.to}
    initialGuests={{ adults: context.guests, children: 0, infants: 0, pets: 0 }}
    onClose={() => { window.location.href = '/parceiros'; }}
    currency="BRL"
    isSaved={false}
    onToggleSave={() => {}}
    onStartBooking={() => {}}
    presentation="page"
    onImobSysSearch={searchProperty}
    imobSysSearchState={searchState}
  />;
}
