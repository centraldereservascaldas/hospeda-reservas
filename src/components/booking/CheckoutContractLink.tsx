import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { isLegalPage, readLegalPageSummaries, type LegalPage } from '../../utils/legalPages';
import { useDialogFocus } from '../useDialogFocus';

interface CheckoutContractLinkProps {
  openInModal?: boolean;
  suppliedContract?: LegalPage;
}

function publishedDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function CheckoutContractLink({
  openInModal = false,
  suppliedContract,
}: CheckoutContractLinkProps) {
  const [available, setAvailable] = useState(Boolean(suppliedContract));
  const [isOpen, setIsOpen] = useState(false);
  const [contract, setContract] = useState<LegalPage | null>(suppliedContract ?? null);
  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [contractLoadFailed, setContractLoadFailed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, () => setIsOpen(false), {
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    if (suppliedContract) {
      setAvailable(true);
      setContract(suppliedContract);
      return;
    }
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
  }, [suppliedContract]);

  useEffect(() => {
    if (!isOpen || contract) return;

    const controller = new AbortController();
    setIsLoadingContract(true);
    setContractLoadFailed(false);
    void fetch('/api/public/legal-pages/contrato', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        const candidate =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>).page
            : null;
        if (!controller.signal.aborted) {
          setContract(isLegalPage(candidate) && candidate.slug === 'contrato' ? candidate : null);
          setIsLoadingContract(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setContractLoadFailed(true);
          setIsLoadingContract(false);
        }
      });

    return () => controller.abort();
  }, [contract, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!available) return null;

  return (
    <>
      <a
        href="/contrato"
        target={openInModal ? undefined : '_blank'}
        rel={openInModal ? undefined : 'noopener noreferrer'}
        onClick={
          openInModal
            ? (event) => {
                event.preventDefault();
                setIsOpen(true);
              }
            : undefined
        }
        aria-haspopup={openInModal ? 'dialog' : undefined}
        className={
          openInModal
            ? 'inline font-semibold text-orange-900 underline underline-offset-4 hover:text-orange-700 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700'
            : 'mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-orange-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700'
        }
      >
        {openInModal ? 'Abrir contrato da hospedagem' : 'Contrato de locação por temporada'}
        {!openInModal && <span className="sr-only"> (abre em nova aba)</span>}
      </a>
      {openInModal &&
        isOpen &&
        createPortal(
          <div
            ref={dialogRef}
            data-dialog-focus-root
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-contract-dialog-title"
            className="fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
          >
            <article className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-4 border-b border-neutral-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 px-5 py-4 sm:px-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-800">
                    Documento da hospedagem
                  </p>
                  <h2
                    id="checkout-contract-dialog-title"
                    className="mt-1 text-xl font-bold text-neutral-950 sm:text-2xl"
                  >
                    {contract?.title ?? 'Contrato da hospedagem'}
                  </h2>
                  {contract && (
                    <p className="mt-1 text-xs text-neutral-600">
                      Versão {contract.version} · Disponível desde{' '}
                      {publishedDate(contract.publishedAt)}
                    </p>
                  )}
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  aria-label="Fechar contrato"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </header>
              <div className="overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
                <div className="mb-5 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 sm:p-5">
                  <p className="font-semibold text-slate-900">Leia as condições da hospedagem</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Confira os valores, prazos e responsabilidades antes de confirmar o pagamento.
                    As seções abaixo podem ser abertas individualmente.
                  </p>
                </div>
                {isLoadingContract ? (
                  <p role="status" className="py-8 text-center text-sm text-neutral-600">
                    Carregando contrato…
                  </p>
                ) : contractLoadFailed || !contract ? (
                  <div
                    role="alert"
                    className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"
                  >
                    Não foi possível carregar o contrato. Tente novamente ou abra a página do
                    contrato.
                    <a
                      href="/contrato"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 font-semibold underline"
                    >
                      Abrir contrato em outra aba
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {contract.sections.map((section, index) => (
                      <details
                        key={`${section.title}-${index}`}
                        open={index === 0}
                        className="group rounded-2xl border border-neutral-200 bg-white px-4 py-3 open:border-orange-200 open:bg-orange-50/40 sm:px-5"
                      >
                        <summary className="cursor-pointer list-none pr-7 text-base font-bold text-neutral-900 marker:hidden focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-orange-700 sm:text-lg [&::-webkit-details-marker]:hidden">
                          <span className="flex items-start justify-between gap-4">
                            {section.title}
                            <span
                              aria-hidden="true"
                              className="text-orange-800 transition-transform group-open:rotate-180"
                            >
                              ▾
                            </span>
                          </span>
                        </summary>
                        <p className="mt-3 whitespace-pre-line border-t border-neutral-200 pt-3 text-sm leading-7 text-neutral-700 sm:text-base">
                          {section.content}
                        </p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </div>,
          document.body,
        )}
    </>
  );
}
