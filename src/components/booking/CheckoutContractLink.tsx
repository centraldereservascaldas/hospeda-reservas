import { useEffect, useState } from 'react';
import { readLegalPageSummaries } from '../../utils/legalPages';

export function CheckoutContractLink() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/public/legal-pages', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (!controller.signal.aborted) {
          setAvailable(readLegalPageSummaries(payload).some((page) => page.slug === 'contrato'));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, []);

  if (!available) return null;

  return (
    <a
      href="/contrato"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-orange-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
    >
      Contrato de locação por temporada
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}
