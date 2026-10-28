import { useEffect, useState } from 'react';
import { MeasurementPreferences } from './MeasurementPreferences';
import { isLegalPage, type LegalPage, type LegalPageSlug } from '../utils/legalPages';

function formatPublishedDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function LegalDocumentPage({ slug }: { slug: LegalPageSlug }) {
  const [page, setPage] = useState<LegalPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/legal-pages/${slug}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        const candidate =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>).page
            : null;
        setPage(isLegalPage(candidate) && candidate.slug === slug ? candidate : null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  return (
    <>
      <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-neutral-800 sm:px-6 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <a
            href="/"
            className="inline-flex min-h-11 w-fit items-center rounded-full border border-neutral-300 bg-white/80 px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            <span aria-hidden="true" className="mr-2">
              ←
            </span>
            Voltar ao catálogo
          </a>

          <MeasurementPreferences showReopenButton placement="inline" />

          {isLoading ? (
            <div
              role="status"
              className="rounded-3xl border border-white bg-white/80 p-6 shadow-sm sm:p-10"
            >
              Carregando documento…
            </div>
          ) : page ? (
            <article className="overflow-hidden rounded-3xl border border-white bg-white/90 shadow-sm">
              <header className="border-b border-neutral-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 px-6 py-8 sm:px-10 sm:py-10">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-800">
                  Central de Reservas Caldas Novas
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                  {page.title}
                </h1>
                <p className="mt-4 text-sm text-neutral-600">
                  Versão {page.version} <span aria-hidden="true">·</span> Publicada em{' '}
                  {formatPublishedDate(page.publishedAt)}
                </p>
              </header>
              <div className="flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-10">
                {page.sections.map((section, index) => (
                  <section
                    key={`${section.title}-${index}`}
                    aria-labelledby={`legal-section-${index}`}
                  >
                    <h2
                      id={`legal-section-${index}`}
                      className="text-lg font-bold text-neutral-900 sm:text-xl"
                    >
                      {section.title}
                    </h2>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-neutral-700 sm:text-base">
                      {section.content}
                    </p>
                  </section>
                ))}
              </div>
            </article>
          ) : (
            <section
              className="rounded-3xl border border-white bg-white/90 p-6 shadow-sm sm:p-10"
              role="status"
            >
              <h1 className="text-2xl font-bold text-neutral-950">Documento indisponível</h1>
              <p className="mt-3 leading-7 text-neutral-700">
                Não foi possível carregar este documento agora. Tente novamente mais tarde.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
