import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building, ChevronLeft, ChevronRight, Images, MapPin, X } from 'lucide-react';
import type { CondominiumSummary } from '../utils/condominiumCatalog';
import { useDialogFocus } from './useDialogFocus';

interface CondominiumDetailModalProps {
  condominium: CondominiumSummary | null;
  onClose: () => void;
}

export const CondominiumDetailModal: React.FC<CondominiumDetailModalProps> = ({ condominium, onClose }) => {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const galleryCloseButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(condominium !== null, onClose, { initialFocusRef: closeButtonRef });
  const galleryDialogRef = useDialogFocus(showGallery && condominium !== null, () => setShowGallery(false), { initialFocusRef: galleryCloseButtonRef });

  useEffect(() => {
    setPhotoIndex(0);
    setShowGallery(false);
  }, [condominium?.id]);

  useEffect(() => {
    if (!condominium) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (showGallery && condominium.images.length > 1 && event.key === 'ArrowRight') {
        setPhotoIndex((index) => (index + 1) % condominium.images.length);
      }
      if (showGallery && condominium.images.length > 1 && event.key === 'ArrowLeft') {
        setPhotoIndex((index) => (index - 1 + condominium.images.length) % condominium.images.length);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [condominium, onClose, showGallery]);

  if (!condominium) return null;

  const imageCount = condominium.images.length;
  const description = condominium.description || 'Ainda não há descrição do condomínio cadastrada.';
  const movePhoto = (direction: -1 | 1) => {
    if (imageCount < 2) return;
    setPhotoIndex((index) => (index + direction + imageCount) % imageCount);
  };

  return createPortal(
    <>
      <div
        ref={dialogRef}
        data-dialog-focus-root
        tabIndex={-1}
        className="fixed inset-0 z-[100] overflow-y-auto bg-white/25 px-2 py-6 backdrop-blur-xl animate-in fade-in duration-200 sm:px-6 sm:py-10"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes do condomínio ${condominium.name}`}
      >
        <div className="liquid-glass-card mx-auto w-full max-w-5xl overflow-hidden rounded-3xl animate-in zoom-in-95 duration-200">
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/70 bg-white/45 px-5 py-3.5 backdrop-blur-2xl sm:px-7">
            <span className="text-sm font-bold text-neutral-800">Detalhes do condomínio</span>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Fechar detalhes do condomínio" className="liquid-glass-button flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-7 bg-white/20 p-4 backdrop-blur-xl sm:p-8">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/90 px-3 py-1 text-xs font-bold text-orange-700">
                <Building className="h-3.5 w-3.5" /> Condomínio
              </span>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-950 sm:text-3xl">{condominium.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600">
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Caldas Novas, Goiás</span>
                <span>{condominium.accommodationCount} {condominium.accommodationCount === 1 ? 'acomodação associada' : 'acomodações associadas'}</span>
              </div>
            </div>

            {imageCount > 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/30 p-1 shadow-lg backdrop-blur-xl">
                <div className="grid h-[300px] grid-cols-1 gap-1 overflow-hidden rounded-[0.9rem] sm:h-[440px] sm:grid-cols-4 sm:grid-rows-2">
                  <button type="button" onClick={() => setShowGallery(true)} aria-label={`Ampliar foto do condomínio ${condominium.name}`} className="group relative overflow-hidden sm:col-span-2 sm:row-span-2">
                    <img src={condominium.images[0]} alt={`${condominium.name} — foto do condomínio`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-neutral-800 shadow backdrop-blur"><Images className="h-3.5 w-3.5 text-orange-600" /> Fotos do condomínio</span>
                  </button>
                  {condominium.images.slice(1, 5).map((image, index) => (
                    <button key={image} type="button" onClick={() => { setPhotoIndex(index + 1); setShowGallery(true); }} aria-label={`Ampliar foto ${index + 2} do condomínio ${condominium.name}`} className="group relative hidden overflow-hidden sm:block">
                      <img src={image} alt={`${condominium.name} — foto ${index + 2} do condomínio`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    </button>
                  ))}
                </div>
                {imageCount > 1 && (
                  <button type="button" onClick={() => { setPhotoIndex(0); setShowGallery(true); }} className="absolute bottom-3 right-3 rounded-xl border border-white/80 bg-white/90 px-4 py-2 text-xs font-bold text-neutral-900 shadow-lg backdrop-blur-md transition hover:bg-white">
                    Mostrar todas as {imageCount} fotos
                  </button>
                )}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-orange-50 text-orange-700"><Building className="h-12 w-12" /><span className="text-sm font-semibold">Fotos do condomínio indisponíveis</span></div>
            )}

            <section aria-labelledby="condominium-description-title" className="liquid-glass-card rounded-2xl p-5 sm:p-7">
              <h2 id="condominium-description-title" className="text-lg font-bold text-neutral-950">Sobre o condomínio</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-neutral-700">{description}</p>
            </section>
          </div>
        </div>
      </div>

      {showGallery && imageCount > 0 && createPortal(
        <div ref={galleryDialogRef} data-dialog-focus-root tabIndex={-1} className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center overflow-hidden bg-neutral-950/95 p-4 text-white backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={`Galeria de fotos do condomínio ${condominium.name}`}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8">
            <div><h2 className="text-sm font-bold sm:text-base">{condominium.name}</h2><p className="mt-0.5 text-xs text-white/70">{photoIndex + 1} de {imageCount} fotos do condomínio</p></div>
            <button ref={galleryCloseButtonRef} type="button" onClick={() => setShowGallery(false)} aria-label="Fechar galeria" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative flex h-full w-full max-w-6xl items-center justify-center pb-16 pt-14">
            <img src={condominium.images[photoIndex]} alt={`${condominium.name} — foto ${photoIndex + 1} do condomínio`} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
            {imageCount > 1 && <>
              <button type="button" onClick={() => movePhoto(-1)} aria-label="Foto anterior" className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 sm:left-4"><ChevronLeft className="h-6 w-6" /></button>
              <button type="button" onClick={() => movePhoto(1)} aria-label="Próxima foto" className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 sm:right-4"><ChevronRight className="h-6 w-6" /></button>
            </>}
          </div>
        </div>,
        document.body,
      )}
    </>,
    document.body,
  );
};
