type Props = { page: number; hasMore: boolean; onChange: (page: number) => void; label: string };

export function AffiliatePagination({ page, hasMore, onChange, label }: Props) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label={label} className="flex items-center gap-3 py-2">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span>Página {page}</span>
      <button type="button" disabled={!hasMore} onClick={() => onChange(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}
