import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { checkoutApi } from '../../services/checkoutApi';
import type { CheckoutAccessCredentials } from '../../services/checkoutApi';
import { loadCieloSopSdk } from '../../services/cieloSopSdk';
import type { CieloSopEnvironment } from '../../services/cieloSopSdk';
import { clearCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { emitFunnelEvent } from '../../utils/measurementEvents';

interface CieloSopCardFormProps {
  reference: string;
  amount: string;
  credentials: CheckoutAccessCredentials | null;
  onAttemptFinished: () => void;
  previewOnly?: boolean;
  preparePayment?: () => Promise<CieloPaymentContext>;
  children?: ReactNode;
  beforeSubmit?: ReactNode;
  guestPrefill?: { fullName: string; email: string };
  submitLabel?: string;
  disabled?: boolean;
}

export interface CieloPaymentContext {
  reference: string;
  amount: string;
  credentials: CheckoutAccessCredentials;
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
  preparePayment,
  children,
  beforeSubmit,
  guestPrefill,
  submitLabel,
  disabled = false,
}: CieloSopCardFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const accessTokenRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(false);
  const sopTimeoutRef = useRef<number | null>(null);
  const [formState, setFormState] = useState<FormState>(
    previewOnly || preparePayment ? 'ready' : 'loading',
  );
  const paymentContextRef = useRef<CieloPaymentContext | null>(null);
  const usesPreparation = Boolean(preparePayment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [environment, setEnvironment] = useState<CieloSopEnvironment>('sandbox');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (previewOnly || usesPreparation) {
      mountedRef.current = true;
      setFormState('ready');
      return () => {
        mountedRef.current = false;
        if (sopTimeoutRef.current !== null) window.clearTimeout(sopTimeoutRef.current);
      };
    }

    let isCurrent = true;
    mountedRef.current = true;
    setFormState('loading');
    setError(null);
    accessTokenRef.current = null;

    void checkoutApi
      .getCieloSopAccessToken(reference, credentials)
      .then(async (response) => {
        if (!isCurrent) return;
        if (!response || !['sandbox', 'production'].includes(response.environment)) {
          setFormState('error');
          setError('Não foi possível preparar o pagamento com cartão. Tente novamente mais tarde.');
          return;
        }
        await loadCieloSopSdk(response.environment);
        if (!isCurrent) return;
        setEnvironment(response.environment);
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
  }, [credentials, previewOnly, reference, usesPreparation]);

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
      const context =
        paymentContextRef.current ?? (credentials ? { reference, credentials, amount } : null);
      if (!context) {
        setError('Esta sessão não tem credencial para continuar o pagamento.');
        return;
      }

      submittingRef.current = true;
      setIsSubmitting(true);
      setError(null);
      emitFunnelEvent({ event: 'add_payment_info', payment_type: 'card' });
      try {
        const result = await checkoutApi.createCheckoutPayment(
          context.reference,
          context.credentials,
          context.amount,
          {
            paymentMethod: 'card',
            paymentMethodId: 'cielo_credit_card',
            token: paymentToken,
            installments: 1,
            cardholderName,
            cardholderEmail,
            payerIdentification: { type: documentType, number: documentNumber },
            idempotencyKey: crypto.randomUUID(),
          },
        );
        if (result.kind === 'response' && result.success) return;
        if (!mountedRef.current) return;
        if (result.kind === 'not-found' && context.credentials.type === 'resume-token') {
          clearCheckoutResumeToken(context.reference);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    let paymentEnvironment = environment;
    if (previewOnly || disabled) return;
    if (preparePayment && !event.currentTarget.reportValidity()) return;
    if (
      formState !== 'ready' ||
      isSubmitting ||
      submittingRef.current ||
      (!preparePayment && (!accessTokenRef.current || !window.bpSop_silentOrderPost))
    )
      return;
    setError(null);
    submittingRef.current = true;
    setIsSubmitting(true);
    if (preparePayment) {
      try {
        const context = await preparePayment();
        if (!mountedRef.current) return;
        paymentContextRef.current = context;
        const response = await checkoutApi.getCieloSopAccessToken(
          context.reference,
          context.credentials,
        );
        if (!response) throw new Error('Não foi possível preparar o pagamento. Tente novamente.');
        await loadCieloSopSdk(response.environment);
        if (!mountedRef.current) return;
        accessTokenRef.current = response.accessToken;
        setEnvironment(response.environment);
        // Use the returned environment immediately; state updates are asynchronous.
        paymentEnvironment = response.environment;
      } catch (failure) {
        if (mountedRef.current) {
          submittingRef.current = false;
          setIsSubmitting(false);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível preparar a reserva. Tente novamente.',
          );
        }
        return;
      }
    }
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
      window.bpSop_silentOrderPost!({
        accessToken: accessTokenRef.current!,
        environment: paymentEnvironment,
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
    <form
      ref={formRef}
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-4"
      noValidate
      aria-busy={isSubmitting}
    >
      {children && (
        <fieldset disabled={isSubmitting} className="min-w-0">
          {children}
        </fieldset>
      )}
      {previewOnly && (
        <p
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
          role="status"
        >
          Prévia visual: não insira dados reais. Este formulário está desativado e não envia
          informações nem realiza cobranças.
        </p>
      )}
      {!usesPreparation && (
        <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-bold text-neutral-950">Pagamento seguro com cartão</p>
          <p className="mt-1">
            {moneyFormatter.format(Number(amount))} ·{' '}
            {environment === 'sandbox' ? 'ambiente de testes Cielo' : 'pagamento via Cielo'}
          </p>
        </div>
      )}
      <fieldset
        disabled={previewOnly || isSubmitting}
        className="grid gap-4 sm:grid-cols-2 disabled:opacity-65"
      >
        <legend className="mb-4 text-xl font-bold text-neutral-950">Pague com cartão</legend>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          Número do cartão
          <input
            autoComplete="cc-number"
            required
            inputMode="numeric"
            className="bp-sop-cardnumber min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800">
          Validade (MM/AAAA)
          <input
            autoComplete="cc-exp"
            required
            inputMode="numeric"
            placeholder="MM/AAAA"
            className="bp-sop-cardexpirationdate min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800">
          Código de segurança
          <input
            autoComplete="cc-csc"
            required
            inputMode="numeric"
            className="bp-sop-cardcvv bp-sop-cardcvvc min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          Nome no cartão
          <input
            name="cardholderName"
            required
            defaultValue={guestPrefill?.fullName}
            autoComplete="cc-name"
            className="bp-sop-cardholdername min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          E-mail do titular
          <input
            name="cardholderEmail"
            required
            defaultValue={guestPrefill?.email}
            type="email"
            autoComplete="email"
            className="min-h-11 w-full rounded-lg border border-neutral-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
          CPF ou CNPJ do titular
          <input
            name="payerDocument"
            required
            minLength={11}
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
      {beforeSubmit && (
        <fieldset disabled={isSubmitting} className="min-w-0">
          {beforeSubmit}
        </fieldset>
      )}
      <button
        type="submit"
        disabled={disabled || previewOnly || formState !== 'ready' || isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-orange-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60"
      >
        {previewOnly
          ? 'Pagamento desativado na prévia'
          : isSubmitting
            ? 'Enviando pagamento…'
            : (submitLabel ?? 'Pagar com cartão')}
      </button>
      <p className="text-xs leading-5 text-neutral-600">
        Os dados do cartão são enviados diretamente à Cielo para gerar um token temporário de
        pagamento.
      </p>
    </form>
  );
}
