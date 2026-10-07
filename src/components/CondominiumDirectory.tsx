import React, { useState } from 'react';
import { Building, ChevronLeft, ChevronRight, Images, MapPin } from 'lucide-react';
import type { CondominiumSummary } from '../utils/condominiumCatalog';

interface CondominiumDirectoryProps {
  condominiums: CondominiumSummary[];
  onSelectCondominium: (condominium: CondominiumSummary) => void;
}

export const CondominiumDirectory: React.FC<CondominiumDirectoryProps> = ({ condominiums, onSelectCondominium }) => {
  const [photoIndexes, setPhotoIndexes] = useState<Record<string, number>>({});

  if (!condominiums.length) {
    return (
      <div className="py-20 text-center text-neutral-600">
        <Building className="mx-auto mb-3 h-9 w-9 text-orange-500" />
        <h2 className="font-bold text-neutral-900">Nenhum condomínio disponível no catálogo</h2>
        <p className="mt-1 text-sm">Os condomínios aparecem aqui quando estão associados a acomodações ativas.</p>
      </div>
    );
  }

  return (
    <section aria-label="Condomínios de Caldas Novas" className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Guia de condomínios</p>
        <h1 className="mt-1 text-2xl font-black text-neutral-950 sm:text-3xl">Conheça os condomínios</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">Veja as fotos e as informações do condomínio antes de escolher uma acomodação.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {condominiums.map((condominium) => {
          const photoIndex = photoIndexes[condominium.id] || 0;
          const description = condominium.description || 'Ainda não há descrição do condomínio cadastrada.';
          const shownDescription = description.length > 145 ? `${description.slice(0, 145).trimEnd()}…` : description;

          return (
            <article key={condominium.id} className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 shadow-[0_10px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl">
              <div className="group relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-orange-100 via-white to-amber-100">
                <button type="button" aria-label={`Ver detalhes de ${condominium.name}`} onClick={() => onSelectCondominium(condominium)} className="absolute inset-0 z-[1] cursor-pointer" />
                {condominium.images.length > 0 ? (
                  <img
                    src={condominium.images[photoIndex]}
                    alt={`${condominium.name} — foto do condomínio`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-orange-700">
                    <Building className="h-12 w-12" />
                    <span className="text-xs font-semibold">Foto do condomínio indisponível</span>
                  </div>
                )}
                {condominium.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={`Foto anterior de ${condominium.name}`}
                      onClick={() => setPhotoIndexes((current) => ({ ...current, [condominium.id]: (photoIndex - 1 + condominium.images.length) % condominium.images.length }))}
                      className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/75 text-neutral-800 shadow-lg backdrop-blur-md transition hover:bg-white"
                    ><ChevronLeft className="h-5 w-5" /></button>
                    <button
                      type="button"
                      aria-label={`Próxima foto de ${condominium.name}`}
                      onClick={() => setPhotoIndexes((current) => ({ ...current, [condominium.id]: (photoIndex + 1) % condominium.images.length }))}
                      className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/75 text-neutral-800 shadow-lg backdrop-blur-md transition hover:bg-white"
                    ><ChevronRight className="h-5 w-5" /></button>
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">{photoIndex + 1} / {condominium.images.length}</span>
                  </>
                )}
                <span className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/75 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-neutral-700 shadow-sm backdrop-blur-md">
                  <Images className="h-3.5 w-3.5 text-orange-600" />
                  Fotos do condomínio
                </span>
              </div>

              <div className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button type="button" onClick={() => onSelectCondominium(condominium)} className="text-left text-base font-extrabold leading-tight text-neutral-950 transition hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{condominium.name}</button>
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-neutral-500">
                      <MapPin className="h-3 w-3 text-orange-500" /> Caldas Novas, Goiás
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-orange-200/80 bg-orange-50/80 px-2.5 py-1 text-[11px] font-bold text-orange-800">
                    {condominium.accommodationCount} {condominium.accommodationCount === 1 ? 'acomodação' : 'acomodações'}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-neutral-700">{shownDescription}</p>
                <button type="button" onClick={() => onSelectCondominium(condominium)} className="mt-3 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800 transition hover:border-orange-300 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  Ver detalhes do condomínio
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
