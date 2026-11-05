import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { checkoutApi } from '../../services/checkoutApi';
import type { CheckoutAccessCredentials } from '../../services/checkoutApi';
import { loadCieloSopSdk } from '../../services/cieloSopSdk';
import type { CieloSopEnvironment } from '../../services/cieloSopSdk';
import { clearCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { emitFunnelEvent } from '../../utils/measurementEvents';
import {
  formatBrazilianDocument,
  formatCardExpiration,
  formatCardNumber,
} from '../../utils/checkoutInputFormatting';

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
  paymentMethod?: 'card' | 'pix';
  alternativeContent?: ReactNode;
  onAlternativeSubmit?: () => Promise<void>;
  onPricingChange?: (pricing: CieloCardPricing) => void;
  failureContent?: ReactNode;
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
const maximumCardInstallments = 6;

export interface CieloCardPricing {
  installments: number;
  ratePercent: number;
  baseCents: number;
  feeCents: number;
  totalCents: number;
}

export function formatCieloCardPayment(pricing: CieloCardPricing): string {
  if (pricing.installments === 1) {
    return moneyFormatter.format(pricing.totalCents / 100);
  }

  const maximumInstallmentCents = Math.ceil(pricing.totalCents / pricing.installments);
  return `${pricing.installments}x de até ${moneyFormatter.format(maximumInstallmentCents / 100)}`;
}

export function getCieloCardPricing(amount: string, installments: number): CieloCardPricing {
  const totalCents = Math.round(Number(amount) * 100);
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 1 ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > maximumCardInstallments
  ) {
    throw new Error('Valor ou parcelamento inválido.');
  }
  const rateBasisPoints = installments === 1 ? 599 : installments <= 3 ? 1250 : 1800;
  const chargedCents = Math.ceil((totalCents * 10_000) / (10_000 - rateBasisPoints));

  return {
    installments,
    ratePercent: rateBasisPoints / 100,
    baseCents: totalCents,
    feeCents: chargedCents - totalCents,
    totalCents: chargedCents,
  };
}

function getInstallmentOptions(amount: string): Array<CieloCardPricing & { label: string }> {
  let pricing: CieloCardPricing[];
  try {
    pricing = Array.from({ length: maximumCardInstallments }, (_, index) =>
      getCieloCardPricing(amount, index + 1),
    );
  } catch {
    return [];
  }

  return pricing
    .filter(({ installments, totalCents }) => Math.floor(totalCents / installments) >= 500)
    .map((option) => ({
      ...option,
      label:
        option.installments === 1
          ? `1x de ${formatCieloCardPayment(option)}`
          : formatCieloCardPayment(option),
    }));
}

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
  paymentMethod = 'card',
  alternativeContent,
  onAlternativeSubmit,
  onPricingChange,
  failureContent,
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
  const [installments, setInstallments] = useState(1);
  const installmentOptions = useMemo(() => getInstallmentOptions(amount), [amount]);
  const selectedPricing =
    installmentOptions.find((option) => option.installments === installments) ??
    installmentOptions[0];

  useEffect(() => {
    if (selectedPricing) onPricingChange?.(selectedPricing);
  }, [onPricingChange, selectedPricing]);

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
          selectedPricing ? (selectedPricing.totalCents / 100).toFixed(2) : context.amount,
          {
            paymentMethod: 'card',
            paymentMethodId: 'cielo_credit_card',
            token: paymentToken,
            installments,
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
    [amount, credentials, installments, onAttemptFinished, reference, selectedPricing],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    let paymentEnvironment = environment;
    if (previewOnly || disabled) return;
    if (preparePayment && !event.currentTarget.reportValidity()) return;
    if (paymentMethod === 'pix') {
      if (isSubmitting || submittingRef.current || !onAlternativeSubmit) return;
      setError(null);
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        await onAlternativeSubmit();
      } catch (failure) {
        if (mountedRef.current) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível abrir o pagamento Pix. Tente novamente.',
          );
        }
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) setIsSubmitting(false);
      }
      return;
    }
    if (!selectedPricing) {
      setError(
        'O pagamento com cartão exige parcelas de no mínimo R$ 5,00. Escolha Pix ou fale com o atendimento.',
      );
      return;
    }
    const expirationInput = formRef.current?.querySelector<HTMLInputElement>(
      '.bp-sop-cardexpirationdate',
    );
    const expirationDigits = expirationInput?.value.replace(/\D/g, '') ?? '';
    if (!/^(0[1-9]|1[0-2])\d{2}$/.test(expirationDigits)) {
      setError('Informe a validade do cartão no formato MM/AA.');
      return;
    }
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
      const cardInput = formRef.current?.querySelector<HTMLInputElement>('.bp-sop-cardnumber');
      const displayedCard = cardInput?.value;
      const displayedExpiration = expirationInput?.value;
      if (cardInput) cardInput.value = cardInput.value.replace(/\D/g, '');
      if (expirationInput)
        expirationInput.value = `${expirationDigits.slice(0, 2)}/20${expirationDigits.slice(2)}`;
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
      } finally {
        if (cardInput && displayedCard !== undefined) cardInput.value = displayedCard;
        if (expirationInput && displayedExpiration !== undefined)
          expirationInput.value = displayedExpiration;
      }
    } catch {
      finishTokenization();
      setError('Não foi possível iniciar a validação segura do cartão. Tente novamente.');
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(event) => void handleSubmit(event)}
      className="checkout-card-payment space-y-5"
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
          Prévia visual: escolha as parcelas para conferir os valores. Os campos do cartão e o
          pagamento estão desativados; não insira dados reais.
        </p>
      )}
      {!usesPreparation && paymentMethod === 'card' && (
        <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-bold text-neutral-950">Pagamento seguro com cartão</p>
          <p className="mt-1">
            {moneyFormatter.format(Number(amount))} ·{' '}
            {environment === 'sandbox' ? 'ambiente de testes Cielo' : 'pagamento via Cielo'}
          </p>
        </div>
      )}
      {paymentMethod === 'card' ? (
        <fieldset disabled={isSubmitting} className="grid gap-4 sm:grid-cols-2 disabled:opacity-65">
          <legend className="mb-4 text-lg font-bold text-neutral-950">
            {usesPreparation && (
              <span aria-hidden="true" className="checkout-section-number mr-3">
                3
              </span>
            )}
            Pague com cartão
          </legend>
          <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
            Número do cartão
            <input
              disabled={previewOnly}
              autoComplete="cc-number"
              required
              inputMode="numeric"
              maxLength={23}
              onChange={(event) => {
                event.currentTarget.value = formatCardNumber(event.currentTarget.value);
              }}
              className="bp-sop-cardnumber min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800">
            Validade (MM/AA)
            <input
              disabled={previewOnly}
              autoComplete="cc-exp"
              required
              inputMode="numeric"
              placeholder="MM/AA"
              maxLength={5}
              onChange={(event) => {
                event.currentTarget.value = formatCardExpiration(event.currentTarget.value);
              }}
              className="bp-sop-cardexpirationdate min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800">
            Código de segurança
            <input
              disabled={previewOnly}
              autoComplete="cc-csc"
              required
              inputMode="numeric"
              className="bp-sop-cardcvv bp-sop-cardcvvc min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
            Nome no cartão
            <input
              disabled={previewOnly}
              name="cardholderName"
              required
              defaultValue={guestPrefill?.fullName}
              autoComplete="cc-name"
              className="bp-sop-cardholdername min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
            E-mail do titular
            <input
              disabled={previewOnly}
              name="cardholderEmail"
              required
              defaultValue={guestPrefill?.email}
              type="email"
              autoComplete="email"
              className="min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
            CPF ou CNPJ do titular
            <input
              disabled={previewOnly}
              name="payerDocument"
              required
              minLength={11}
              autoComplete="off"
              inputMode="numeric"
              maxLength={18}
              onChange={(event) => {
                event.currentTarget.value = formatBrazilianDocument(event.currentTarget.value);
              }}
              className="min-h-11 w-full rounded-xl border border-neutral-400/70 px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutral-800 sm:col-span-2">
            Parcelamento
            <select
              name="installments"
              required
              disabled={installmentOptions.length === 0}
              value={installments}
              onChange={(event) => setInstallments(Number(event.target.value))}
              className="min-h-11 w-full rounded-xl border border-neutral-400/70 bg-white px-3 font-normal focus-visible:border-orange-700 focus-visible:outline-2 focus-visible:outline-orange-700"
            >
              {installmentOptions.length === 0 && (
                <option value={1}>Cartão indisponível para este valor</option>
              )}
              {installmentOptions.map((option) => (
                <option key={option.installments} value={option.installments}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal leading-5 text-neutral-600">
              {installmentOptions.length === 0 ? (
                'A parcela mínima no cartão é de R$ 5,00. Escolha Pix ou fale com o atendimento.'
              ) : (
                <>
                  Hospedagem {moneyFormatter.format(Number(amount))} + acréscimo do cartão{' '}
                  {selectedPricing
                    ? `${moneyFormatter.format(selectedPricing.feeCents / 100)} (${selectedPricing.ratePercent.toLocaleString('pt-BR')}%)`
                    : 'indisponível'}
                  . Total final{' '}
                  {selectedPricing
                    ? moneyFormatter.format(selectedPricing.totalCents / 100)
                    : 'indisponível'}
                  .
                </>
              )}
            </span>
          </label>
        </fieldset>
      ) : (
        alternativeContent
      )}
      {formState === 'loading' && (
        <p role="status" className="text-sm text-neutral-700">
          Preparando o formulário seguro…
        </p>
      )}
      {error && (
        <div>
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
          {failureContent}
        </div>
      )}
      {beforeSubmit && (
        <fieldset disabled={isSubmitting} className="min-w-0">
          {beforeSubmit}
        </fieldset>
      )}
      <button
        type="submit"
        disabled={
          disabled ||
          previewOnly ||
          formState !== 'ready' ||
          isSubmitting ||
          (paymentMethod === 'card' && !selectedPricing)
        }
        className="checkout-payment-submit inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-800 px-5 py-4 text-sm font-bold text-white transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed"
      >
        {previewOnly
          ? 'Pagamento desativado na prévia'
          : isSubmitting
            ? paymentMethod === 'pix'
              ? 'Abrindo Pix seguro…'
              : 'Enviando pagamento…'
            : (submitLabel ??
              (paymentMethod === 'card' && selectedPricing?.installments > 1 ? (
                <span className="flex flex-col items-center gap-1 leading-tight">
                  <span>Confirmar e pagar</span>
                  <span className="text-base font-extrabold">
                    {formatCieloCardPayment(selectedPricing)}
                  </span>
                </span>
              ) : paymentMethod === 'card' && selectedPricing ? (
                `Confirmar e pagar ${formatCieloCardPayment(selectedPricing)}`
              ) : (
                'Pagar com cartão'
              )))}
      </button>
      <p className="text-xs leading-5 text-neutral-600">
        {paymentMethod === 'pix'
          ? 'O QR Code e o código copia e cola aparecerão aqui, sem sair desta página.'
          : 'Os dados do cartão são enviados diretamente à Cielo para gerar um token temporário de pagamento.'}
      </p>
    </form>
  );
}
