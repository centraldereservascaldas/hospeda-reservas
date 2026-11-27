import { Building2, Maximize2 } from 'lucide-react';

interface PropertyPhotoGridProps {
  propertyTitle: string;
  images: string[];
  isLoading?: boolean;
  onOpenGallery: (index?: number) => void;
}

export function PropertyPhotoGrid({
  propertyTitle,
  images,
  isLoading = false,
  onOpenGallery,
}: PropertyPhotoGridProps) {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xs">
      <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 h-[340px] sm:h-[460px] [@media(max-height:400px)]:h-60">
        {images.length > 0 ? (
          <button
            type="button"
            aria-label={`Ampliar foto principal de ${propertyTitle}`}
            className="md:col-span-2 md:row-span-2 relative overflow-hidden group cursor-pointer border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            onClick={() => onOpenGallery(0)}
          >
            <img
              src={images[0]}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
          </button>
        ) : (
          <div
            className="md:col-span-2 md:row-span-2 flex flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-orange-50 via-white to-sky-50 text-neutral-600"
            role={isLoading ? 'status' : undefined}
            aria-live={isLoading ? 'polite' : undefined}
          >
            <Building2 aria-hidden="true" className="h-12 w-12 text-orange-500" />
            <span className="text-sm font-semibold">
              {isLoading ? 'Carregando fotos do imóvel…' : 'Fotos do imóvel não disponíveis'}
            </span>
          </div>
        )}

        {images.slice(1, 5).map((image, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Ampliar foto ${index + 2} de ${propertyTitle}`}
            className="relative overflow-hidden group cursor-pointer hidden md:block border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            onClick={() => onOpenGallery(index + 1)}
          >
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
          </button>
        ))}
      </div>

      {images.length > 0 && (
        <button
          type="button"
          onClick={() => onOpenGallery(0)}
          aria-label={`Mostrar todas as ${images.length} fotos`}
          className="absolute bottom-4 right-4 flex min-h-11 items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-sm font-bold text-neutral-900 shadow-md border border-neutral-200 transition-all cursor-pointer hover:scale-105"
        >
          <Maximize2 className="w-4 h-4" />
          <span>Mostrar todas as {images.length} fotos</span>
        </button>
      )}
    </div>
  );
}
