import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { checkoutApi } from '../../services/checkoutApi';
import type { CheckoutAccessCredentials } from '../../services/checkoutApi';
import { loadCieloSopSdk } from '../../services/cieloSopSdk';
import { clearCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { emitFunnelEvent } from '../../utils/measurementEvents';

interface CieloSopCardFormProps {
  reference: string;
  amount: string;
  credentials: CheckoutAccessCredentials | null;
  onAttemptFinished: () => void;
  previewOnly?: boolean;
}

type FormState = 'loading' | 'ready' | 'error';
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const paymentTokenPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CieloSopCardForm({
  reference,
  amount,
  credentials,
  onAttemptFinished,
  previewOnly = false,
}: CieloSopCardFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const accessTokenRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(false);
  const sopTimeoutRef = useRef<number | null>(null);
  const [formState, setFormState] = useState<FormState>(previewOnly ? 'ready' : 'loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (previewOnly) {
      setFormState('ready');
      return undefined;
    }

    let isCurrent = true;
    mountedRef.current = true;
    setFormState('loading');
    setError(null);
    accessTokenRef.current = null;

    void Promise.all([
      checkoutApi.getCieloSopAccessToken(reference, credentials),
      loadCieloSopSdk(),
    ])
      .then(([response]) => {
        if (!isCurrent) return;
        if (!response || response.environment !== 'sandbox') {
          setFormState('error');
          setError('Não foi possível preparar o pagamento com cartão. Tente novamente mais tarde.');
          return;
        }
        accessTokenRef.current = response.accessToken;
        setFormState('ready');
      })
      .catch(() => {
        if (!isCurrent) return;
        setFormState('error');
        setError('Não foi possível carregar o formulário seguro da Cielo.');
      });

    return () => {
      isCurrent = false;
      mountedRef.current = false;
      submittingRef.current = false;
      if (sopTimeoutRef.current !== null) {
        window.clearTimeout(sopTimeoutRef.current);
        sopTimeoutRef.current = null;
      }
    };
  }, [credentials, previewOnly, reference]);

  const submitPaymentToken = useCallback(
    async (paymentToken: string): Promise<void> => {
      if (submittingRef.current || !paymentTokenPattern.test(paymentToken)) {
        setError(
          'A Cielo não retornou um token de pagamento válido. Atualize o formulário e tente novamente.',
        );
        return;
      }
      const cardholderName = formRef.current
        ?.querySelector<HTMLInputElement>('[name="cardholderName"]')
        ?.value.trim();
      const cardholderEmail = formRef.current
        ?.querySelector<HTMLInputElement>('[name="cardholderEmail"]')
        ?.value.trim();
      const documentNumber = formRef.current
        ?.querySelector<HTMLInputElement>('[name="payerDocument"]')
        ?.value.replace(/\D/g, '');
      const documentType = documentNumber?.length === 14 ? 'CNPJ' : 'CPF';
      if (
        !cardholderName ||
        !cardholderEmail ||
        !documentNumber ||
        (documentNumber.length !== 11 && documentNumber.length !== 14)
      ) {
        setError('Informe o nome, e-mail e CPF ou CNPJ do titular.');
        return;
      }
      if (!credentials) {
        setError('Esta sessão não tem credencial para continuar o pagamento.');
        return;
      }

      submittingRef.current = true;
      setIsSubmitting(true);
      setError(null);
      emitFunnelEvent({ event: 'add_payment_info', payment_type: 'card' });
      try {
        const result = await checkoutApi.createCheckoutPayment(reference, credentials, amount, {
          paymentMethod: 'card',
          paymentMethodId: 'cielo_credit_card',
          token: paymentToken,
          installments: 1,
          cardholderName,
          cardholderEmail,
          payerIdentification: { type: documentType, number: documentNumber },
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.kind === 'response' && result.success) return;
        if (!mountedRef.current) return;
        if (result.kind === 'not-found' && credentials.type === 'resume-token') {
          clearCheckoutResumeToken(reference);
        }
        setError(
          result.kind === 'response'
            ? result.message
            : 'Não foi possível iniciar o pagamento. Atualize o pedido antes de tentar novamente.',
        );
      } catch {
        if (mountedRef.current) {
          setError(
            'Não foi possível iniciar o pagamento. Atualize o pedido antes de tentar novamente.',
          );
        }
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) {
          setIsSubmitting(false);
          onAttemptFinished();
        }
      }
    },
    [amount, credentials, onAttemptFinished, reference],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (previewOnly) return;
    if (
      formState !== 'ready' ||
      isSubmitting ||
      submittingRef.current ||
      !accessTokenRef.current ||
      !window.bpSop_silentOrderPost
    )
      return;
    setError(null);
    submittingRef.current = true;
    setIsSubmitting(true);
    const finishTokenization = (): void => {
      submittingRef.current = false;
      setIsSubmitting(false);
      if (sopTimeoutRef.current !== null) {
        window.clearTimeout(sopTimeoutRef.current);
        sopTimeoutRef.current = null;
      }
    };
    sopTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !submittingRef.current) return;
      finishTokenization();
      setError(
        'A validação do cartão demorou mais que o esperado. Confira os dados e tente novamente.',
      );
    }, 30_000);

    try {
      window.bpSop_silentOrderPost({
        accessToken: accessTokenRef.current,
        environment: 'sandbox',
        language: 'pt',
        enableTokenize: false,
        onSuccess: (response) => {
          if (!mountedRef.current || !submittingRef.current) return;
          finishTokenization();
          const token = response.PaymentToken;
          if (!token || !paymentTokenPattern.test(token)) {
            setError('A Cielo não retornou o token temporário necessário para o pagamento.');
            return;
          }
          void submitPaymentToken(token);
        },
        onError: () => {
          if (!mountedRef.current || !submittingRef.current) return;
          finishTokenization();
          setError('A Cielo não conseguiu validar o cartão. Confira os dados e tente novamente.');
        },
        onInvalid: () => {
          if (!mountedRef.current || !submittingRef.current) return;
          finishTokenization();
          setError('Confira os dados do cartão indicados e tente novamente.');
        },
      });
    } catch {
      finishTokenization();
      setError('Não foi possível iniciar a validação segura do cartão. Tente novamente.');
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {previewOnly && (
        <p
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
          role="status"
        >
          Prévia visual: não insira dados reais. Este formulário está desativado e não envia
          informações nem realiza cobranças.
        </p>
      )}
      <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
        <p className="font-bold text-neutral-950">Pagamento seguro com cartão</p>
        <p className="mt-1">{moneyFormatter.format(Number(amount))} · ambiente de testes Cielo</p>
      </div>
      <fieldset disabled={previewOnly} className="grid gap-4 sm:grid-cols-2 disabled:opacity-65">
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          Número do cartão
          <input
            autoComplete="cc-number"
            inputMode="numeric"
            className="bp-sop-cardnumber min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800">
          Validade (MM/AAAA)
          <input
            autoComplete="cc-exp"
            inputMode="numeric"
            placeholder="MM/AAAA"
            className="bp-sop-cardexpirationdate min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800">
          Código de segurança
          <input
            autoComplete="cc-csc"
            inputMode="numeric"
            className="bp-sop-cardcvv bp-sop-cardcvvc min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          Nome no cartão
          <input
            name="cardholderName"
            autoComplete="cc-name"
            className="bp-sop-cardholdername min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          E-mail do titular
          <input
            name="cardholderEmail"
            type="email"
            autoComplete="email"
            className="min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          CPF ou CNPJ do titular
          <input
            name="payerDocument"
            autoComplete="off"
            inputMode="numeric"
            maxLength={18}
            className="min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
      </fieldset>
      {formState === 'loading' && (
        <p role="status" className="text-sm text-neutral-700">
          Preparando o formulário seguro…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={previewOnly || formState !== 'ready' || isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-orange-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
      >
        {previewOnly
          ? 'Pagamento desativado na prévia'
          : isSubmitting
            ? 'Enviando pagamento…'
            : 'Pagar com cartão'}
      </button>
      <p className="text-xs leading-5 text-neutral-600">
        Os dados do cartão são enviados diretamente à Cielo para gerar um token temporário de
        pagamento.
      </p>
    </form>
  );
}
