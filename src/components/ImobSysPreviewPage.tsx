import { useEffect, useState, type FormEvent } from 'react';
import type { Property } from '../types';
import { apiFetch } from '../services/apiFetch';
import { isProperty, isRecord } from '../utils/apiValidation';

const pageSize = 12;
let mediaQueue: Promise<void> = Promise.resolve();

function loadMedia(id: string, signal: AbortSignal): Promise<string[]> {
  const result = mediaQueue.then(async () => {
    if (signal.aborted) return [];
    const url = '/api/accommodations/' + encodeURIComponent(id) + '/media';
    let response = await apiFetch(url, { signal });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(60, Math.max(2, retryAfter || 60)) * 1000));
      if (signal.aborted) return [];
      response = await apiFetch(url, { signal });
    }
    const body: unknown = response.ok ? await response.json() : null;
    return isRecord(body) && isRecord(body.data) && Array.isArray(body.data.images)
      ? body.data.images.filter((image): image is string => typeof image === 'string')
      : [];
  });
  mediaQueue = result.then(() => undefined, () => undefined);
  return result;
}

function PreviewCard({ property, context }: { property: Property; context: { from: string; to: string; guests: number } }) {
  const [images, setImages] = useState<string[] | null>(property.images.length ? property.images : null);
  const query = new URLSearchParams({ checkin: context.from, checkout: context.to, guests: String(context.guests) });
  useEffect(() => {
    if (property.images.length) return;
    const controller = new AbortController();
    void loadMedia(property.id, controller.signal).then(setImages).catch(() => setImages([]));
    return () => controller.abort();
  }, [property]);

  return <article className="overflow-hidden rounded-2xl bg-white shadow-sm border border-neutral-200">
    <a href={'/apartamento/' + encodeURIComponent(property.id.replace(/^imobsys-crcn-/, 'parceiro-crcn-')) + '?' + query} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" aria-label={'Ver detalhes de ' + property.title}>
    {images?.[0] ? <img className="aspect-[4/3] w-full object-cover" src={images[0]} alt={property.title} loading="lazy" /> :
      <div className="aspect-[4/3] grid place-items-center bg-neutral-100 text-neutral-500">{images === null ? 'Carregando foto…' : 'Foto indisponível'}</div>}
    <div className="p-4 space-y-2">
      <h2 className="font-bold text-lg">{property.title}</h2>
      <p className="text-sm text-neutral-600">Até {property.maxGuests} hóspedes</p>
      <p className="font-semibold">{property.imobsysOffer ? property.imobsysOffer.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Valor indisponível'} no Pix</p>
      <p className="text-sm text-neutral-600">Valor observado para o período. Disponibilidade sujeita a confirmação.</p>
    </div>
    </a>
  </article>;
}

export default function ImobSysPreviewPage() {
  const [from, setFrom] = useState('2026-11-25');
  const [to, setTo] = useState('2026-11-27');
  const [guests, setGuests] = useState(2);
  const [properties, setProperties] = useState<Property[]>([]);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [searchContext, setSearchContext] = useState({ from, to, guests });

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(''); setSearched(true); setVisibleCount(pageSize);
    try {
      const params = new URLSearchParams({ from, to, guests: String(guests) });
      const response = await apiFetch('/api/imobsys/offers?' + params);
      const body: unknown = await response.json();
      if (!response.ok || !isRecord(body) || !Array.isArray(body.data) || !body.data.every(isProperty)) {
        throw new Error('Não foi possível consultar os imóveis agora. Tente novamente.');
      }
      setProperties(body.data);
      setSearchContext({ from, to, guests });
    } catch (err) {
      setProperties([]);
      setError(err instanceof Error ? err.message : 'Não foi possível consultar os imóveis.');
    } finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[#faf8f5] text-neutral-900">
    <header className="border-b bg-white"><div className="mx-auto max-w-7xl px-5 py-6">
      <a href="/" className="text-sm font-semibold text-orange-700">← Voltar ao site</a>
      <h1 className="mt-3 text-3xl font-bold">Imóveis de parceiros</h1>
      <p className="mt-2 text-neutral-600">Consulte as ofertas para as datas da sua viagem.</p>
    </div></header>
    <div className="mx-auto max-w-7xl px-5 py-6">
      <form onSubmit={search} className="flex flex-wrap items-end gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <label className="grid gap-1 font-semibold">Entrada<input required type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border p-2 font-normal" /></label>
        <label className="grid gap-1 font-semibold">Saída<input required type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border p-2 font-normal" /></label>
        <label className="grid gap-1 font-semibold">Hóspedes<input required type="number" min="2" max="10" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-24 rounded-lg border p-2 font-normal" /></label>
        <button disabled={loading} className="rounded-xl bg-orange-600 px-6 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Buscando…' : 'Buscar imóveis'}</button>
      </form>
      {error && <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>}
      {loading && <p role="status" className="mt-6">Consultando ofertas, aguarde…</p>}
      {!loading && searched && !error && <p className="my-6 text-neutral-600">{properties.length} imóveis encontrados para o período.</p>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {properties.slice(0, visibleCount).map((property) => <PreviewCard key={property.id} property={property} context={searchContext} />)}
      </div>
      {visibleCount < properties.length && <button onClick={() => setVisibleCount((count) => count + pageSize)} className="mt-8 rounded-xl border border-neutral-400 bg-white px-6 py-3 font-semibold">Mostrar mais imóveis</button>}
    </div>
  </main>;
}
