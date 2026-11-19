import { useEffect, useState } from 'react';
import { LogoCRCN } from '../LogoCRCN';

interface PartnerOffer {
  id: string;
  condominium: string;
  unit: string;
  images: string[];
  from: string;
  to: string;
  nights: number;
  pixCents: number;
}
function parseOffers(value: unknown): PartnerOffer[] {
  if (!value || typeof value !== 'object' || !('preview' in value))
    throw new Error('Resposta inválida.');
  const preview = value.preview;
  if (
    !preview ||
    typeof preview !== 'object' ||
    !('offers' in preview) ||
    !Array.isArray(preview.offers)
  )
    throw new Error('Catálogo indisponível.');
  return preview.offers.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Apartamento inválido.');
    const o = item as Record<string, unknown>;
    if (
      typeof o.id !== 'string' ||
      typeof o.condominium !== 'string' ||
      typeof o.unit !== 'string' ||
      typeof o.from !== 'string' ||
      typeof o.to !== 'string' ||
      typeof o.nights !== 'number' ||
      typeof o.pixCents !== 'number' ||
      !Number.isSafeInteger(o.pixCents) ||
      o.pixCents <= 0 ||
      !Array.isArray(o.images) ||
      !o.images.every(
        (i: unknown) => typeof i === 'string' && i.startsWith('https://reservascrcn.com.br/fotos/'),
      )
    )
      throw new Error('Dados do apartamento incompletos.');
    return {
      id: o.id,
      condominium: o.condominium,
      unit: o.unit,
      from: o.from,
      to: o.to,
      nights: o.nights,
      pixCents: o.pixCents,
      images: o.images as string[],
    };
  });
}

export function ImobsysIntegrationPreview() {
  const [offers, setOffers] = useState<PartnerOffer[]>([]);
  const [message, setMessage] = useState('Carregando apartamentos…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/imobsys/api/preview', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Inicie o serviço separado da ImobSys para consultar os apartamentos.');
        const items = parseOffers(await response.json());
        setOffers(items);
        setMessage(
          `${items.length} ofertas consultadas. Datas e valores precisam ser revalidados antes da compra.`,
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : 'Consulta indisponível.');
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-sky-50 text-neutral-950">
      <header className="border-b border-white/70 bg-white/80 px-6 py-4 shadow-sm backdrop-blur-xl">
        <LogoCRCN />
      </header>
      <section className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-800">
          Integração de parceiros · ambiente local
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Encontre sua próxima hospedagem</h1>
        <p className="mt-4 text-neutral-600" role="status">
          {message}
        </p>
        <div className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {offers.slice(0, 32).map((offer) => (
            <article
              key={offer.id}
              className="overflow-hidden rounded-3xl border border-white bg-white/85 shadow-[0_8px_28px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl"
            >
              {offer.images[0] && (
                <img
                  src={offer.images[0]}
                  alt={`${offer.condominium}, unidade ${offer.unit}`}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              )}
              <div className="p-5">
                <h2 className="font-bold">{offer.condominium}</h2>
                <p className="mt-1 text-sm text-neutral-600">Apartamento {offer.unit}</p>
                <p className="mt-3 text-sm">
                  {offer.from.split('-').reverse().join('/')} —{' '}
                  {offer.to.split('-').reverse().join('/')}
                </p>
                <p className="mt-2 font-bold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    offer.pixCents / 100,
                  )}{' '}
                  <span className="text-sm font-normal">/ {offer.nights} noites</span>
                </p>
                <button
                  disabled
                  className="mt-4 min-h-12 w-full rounded-xl bg-neutral-200 px-4 font-semibold text-neutral-600"
                >
                  Compra em validação
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
