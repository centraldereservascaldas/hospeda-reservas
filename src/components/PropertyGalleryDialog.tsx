import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

interface PropertyGalleryDialogProps {
  propertyTitle: string;
  images: string[];
  isOpen: boolean;
  activePhotoIndex: number;
  setActivePhotoIndex: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
}

export const PropertyGalleryDialog: React.FC<PropertyGalleryDialogProps> = ({
  propertyTitle,
  images,
  isOpen,
  activePhotoIndex,
  setActivePhotoIndex,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen && images.length > 0, onClose, {
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    if (!isOpen || images.length === 0) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        setActivePhotoIndex((index) => (index + 1) % images.length);
      }
      if (event.key === 'ArrowLeft') {
        setActivePhotoIndex((index) => (index - 1 + images.length) % images.length);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, images.length, setActivePhotoIndex]);

  if (!isOpen || images.length === 0) return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-dialog-focus-root
      tabIndex={-1}
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center overflow-hidden bg-white/95 p-4 backdrop-blur-2xl animate-in fade-in duration-200 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-gallery-title"
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-neutral-900 sm:px-8">
        <div>
          <h3 id="property-gallery-title" className="text-sm font-semibold sm:text-base">
            {propertyTitle}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-600">
            {activePhotoIndex + 1} de {images.length} fotos
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar galeria"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex h-full w-full max-w-6xl items-center justify-center pb-20 pt-16">
        <img
          key={images[activePhotoIndex]}
          src={images[activePhotoIndex]}
          alt={`${propertyTitle} — foto ${activePhotoIndex + 1}`}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl sm:rounded-2xl"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() =>
                setActivePhotoIndex((index) => (index - 1 + images.length) % images.length)
              }
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white sm:left-5 sm:h-12 sm:w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => setActivePhotoIndex((index) => (index + 1) % images.length)}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white sm:right-5 sm:h-12 sm:w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 overflow-x-auto bg-white/90 px-4 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:pb-5">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              aria-label={`Abrir foto ${index + 1}`}
              aria-current={index === activePhotoIndex}
              onClick={() => setActivePhotoIndex(index)}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition sm:h-14 sm:w-20 ${index === activePhotoIndex ? 'border-neutral-900 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
};
