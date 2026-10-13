import { Heart, Share2 } from 'lucide-react';

interface PropertyDetailActionsProps {
  isSaved: boolean;
  copiedLink: boolean;
  onShare: () => void;
  onToggleSave: () => void;
}

export function PropertyDetailActions({
  isSaved,
  copiedLink,
  onShare,
  onToggleSave,
}: PropertyDetailActionsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onShare}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 backdrop-blur-md text-xs font-bold text-neutral-700 shadow-2xs transition-all cursor-pointer hover:scale-105"
      >
        <Share2 className="w-4 h-4" />
        <span>{copiedLink ? 'Link copiado!' : 'Compartilhar'}</span>
      </button>

      <button
        type="button"
        onClick={onToggleSave}
        aria-pressed={isSaved}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 backdrop-blur-md text-xs font-bold text-neutral-700 shadow-2xs transition-all cursor-pointer hover:scale-105"
      >
        <Heart
          className={`w-4 h-4 transition-colors ${
            isSaved ? 'fill-orange-500 text-orange-500' : 'text-neutral-700'
          }`}
        />
        <span>{isSaved ? 'Salvo' : 'Salvar'}</span>
      </button>
    </div>
  );
}
