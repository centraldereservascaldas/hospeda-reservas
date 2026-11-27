import { useEffect, useRef } from 'react';

type CheckoutRecoveryPageProps = {
  status: 'loading' | 'error';
  onRetry: () => void;
  onBack: () => void;
};

export function CheckoutRecoveryPage({ status, onRetry, onBack }: CheckoutRecoveryPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [status]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-neutral-900">
      <section className="w-full max-w-md text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {status === 'loading' ? 'Preparando checkout' : 'Recuperar checkout'}
        </h1>
        <p role="status" aria-live="polite" className="mt-4 text-neutral-700">
          {status === 'loading'
            ? 'Conferindo disponibilidade e preço…'
            : 'Não foi possível recuperar esta seleção ou confirmar a disponibilidade. Volte ao imóvel e escolha as datas novamente.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {status === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg px-4 py-2 font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-4 py-2 font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Voltar
          </button>
        </div>
      </section>
    </main>
  );
}
