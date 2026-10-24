import { Heart, Share2 } from 'lucide-react';

interface PropertyDetailActionsProps {
  propertyTitle: string;
  isSaved: boolean;
  shareStatus: 'idle' | 'copied' | 'error';
  onShare: () => void;
  onToggleSave: () => void;
}

export function PropertyDetailActions({
  propertyTitle,
  isSaved,
  shareStatus,
  onShare,
  onToggleSave,
}: PropertyDetailActionsProps) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onShare}
        aria-label={`Compartilhar ${propertyTitle}`}
        className="flex min-h-11 max-w-[min(10rem,40vw)] items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-2 py-2 text-xs font-bold text-neutral-700 shadow-2xs backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:max-w-[min(12rem,45vw)] sm:px-4"
      >
        <Share2 aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span aria-live="polite" className="truncate">
          {shareStatus === 'copied'
            ? 'Link copiado!'
            : shareStatus === 'error'
              ? 'Não foi possível copiar'
              : 'Compartilhar'}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleSave}
        aria-label={
          isSaved
            ? `Remover ${propertyTitle} dos favoritos`
            : `Salvar ${propertyTitle} nos favoritos`
        }
        aria-pressed={isSaved}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-3 py-2 text-xs font-bold text-neutral-700 shadow-2xs backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:px-4"
      >
        <Heart
          aria-hidden="true"
          className={`w-4 h-4 transition-colors ${
            isSaved ? 'fill-orange-500 text-orange-500' : 'text-neutral-700'
          }`}
        />
        <span>{isSaved ? 'Salvo' : 'Salvar'}</span>
      </button>
    </div>
  );
}
