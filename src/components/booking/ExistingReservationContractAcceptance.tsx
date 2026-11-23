import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { isLegalPage, type LegalPage } from '../../utils/legalPages';
import { CheckoutContractLink } from './CheckoutContractLink';

type Contract = LegalPage & { contentHash: string };

export function ExistingReservationContractAcceptance({
  reference,
  resumeToken,
  onAccepted,
}: {
  reference: string;
  resumeToken: string;
  onAccepted: () => void;
}) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch('/api/public/legal-pages/contrato', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: unknown) => {
        const page = result && typeof result === 'object' && 'page' in result ? result.page : null;
        if (
          isLegalPage(page) &&
          page.slug === 'contrato' &&
          'contentHash' in page &&
          typeof page.contentHash === 'string' &&
          /^[a-f0-9]{64}$/.test(page.contentHash)
        )
          setContract(page as Contract);
        else if (!controller.signal.aborted)
          setError('Não foi possível carregar o contrato. Tente novamente mais tarde.');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar o contrato. Tente novamente mais tarde.');
      });
    return () => controller.abort();
  }, []);
  async function submit() {
    if (!contract || !accepted || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/checkout/${encodeURIComponent(reference)}/existing-contract`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Checkout-Resume-Token': resumeToken },
          body: JSON.stringify({
            accepted: true,
            version: contract.version,
            contentHash: contract.contentHash,
          }),
        },
      );
      if (!response.ok) {
        setError(
          'Não foi possível registrar o aceite. Atualize a página ou fale com o atendimento.',
        );
        return;
      }
      onAccepted();
    } catch {
      setError('Não foi possível registrar o aceite. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4"
      aria-labelledby="resume-contract-title"
    >
      <h2 id="resume-contract-title" className="font-bold">
        Condições da hospedagem
      </h2>
      <p className="text-sm">Confira as condições para continuar com este pedido.</p>
      {contract && <CheckoutContractLink openInModal suppliedContract={contract} />}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />{' '}
        Li e aceito as condições da hospedagem.
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!contract || !accepted || submitting}
        onClick={() => void submit()}
        className="min-h-11 rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Registrando aceite…' : 'Confirmar condições'}
      </button>
    </section>
  );
}
