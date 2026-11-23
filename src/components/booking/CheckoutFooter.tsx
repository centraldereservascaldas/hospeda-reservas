import { useEffect, useState } from 'react';
import { readLegalPageSummaries, type LegalPageSummary } from '../../utils/legalPages';

export function CheckoutFooter({
  hideContractLink = false,
}: {
  hideContractLink?: boolean;
}) {
  const [legalPages, setLegalPages] = useState<LegalPageSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/public/legal-pages', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => setLegalPages(readLegalPageSummaries(payload)))
      .catch(() => {
        if (!controller.signal.aborted) setLegalPages([]);
      });

    return () => controller.abort();
  }, []);

  return (
    <footer className="mt-auto border-t border-neutral-200/80 bg-white/35 print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-5 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="space-y-1 text-center sm:text-left">
          <p className="font-semibold text-neutral-800">Central de Reservas Caldas Novas</p>
          <p>CRCN LTDA · CNPJ 67.314.679/0001-64</p>
        </div>

        <nav
          aria-label="Informações e atendimento"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2"
        >
          <a
            href="mailto:centraldereservascn@gmail.com"
            className="min-h-11 inline-flex items-center underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Fale com a gente
          </a>
          {legalPages
            .filter((page) => !hideContractLink || page.slug !== 'contrato')
            .map((page) => (
              <a
                key={page.slug}
                href={page.path}
                target={page.slug === 'contrato' ? '_blank' : undefined}
                rel={page.slug === 'contrato' ? 'noopener noreferrer' : undefined}
                className="min-h-11 inline-flex items-center underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                {page.title}
                {page.slug === 'contrato' && <span className="sr-only"> (abre em nova aba)</span>}
              </a>
            ))}
        </nav>
      </div>
    </footer>
  );
}
