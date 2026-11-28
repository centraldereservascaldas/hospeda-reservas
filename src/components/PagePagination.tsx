import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface PagePaginationProps {
  ariaLabel: string;
  countLabel: ReactNode;
  currentPage: number;
  totalPages: number;
  isBusy?: boolean;
  className?: string;
  onPageChange: (page: number) => void;
}

/** Previous/next controls for a server-paginated collection. */
export function PagePagination({
  ariaLabel,
  countLabel,
  currentPage,
  totalPages,
  isBusy = false,
  className = '',
  onPageChange,
}: PagePaginationProps) {
  const pageCount = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), pageCount);

  return (
    <nav
      aria-label={ariaLabel}
      aria-busy={isBusy || undefined}
      className={`flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <p className="text-xs text-neutral-600" aria-live="polite" aria-atomic="true">
        {countLabel} · página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={isBusy || page <= 1}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={isBusy || page >= pageCount}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
