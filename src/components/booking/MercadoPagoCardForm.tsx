import { useCallback, useEffect, useRef, useState } from 'react';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type { CheckoutAccessCredentials } from '../../services/crcnBackendApi';
import {
  loadMercadoPagoSdk,
  type MercadoPagoCardFormInstance,
} from '../../services/mercadoPagoSdk';
import { clearCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { emitFunnelEvent } from '../../utils/measurementEvents';

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const maximumCardInstallments = 1;

interface MercadoPagoCardFormProps {
  reference: string;
  amount: string;
  publicKey: string;
  credentials: CheckoutAccessCredentials | null;
  isPixAvailable: boolean;
  onAttemptFinished: () => void;
}

const cardFormFields = {
  cardNumber: { id: 'checkout-card-number', placeholder: 'Número do cartão' },
  expirationDate: { id: 'checkout-card-expiration', placeholder: 'MM/AA' },
  securityCode: { id: 'checkout-card-security-code', placeholder: 'Código de segurança' },
  cardholderName: { id: 'checkout-card-holder-name', placeholder: 'Nome como está no cartão' },
  issuer: { id: 'checkout-card-issuer', placeholder: 'Banco emissor' },
  installments: { id: 'checkout-card-installments', placeholder: 'Parcelas' },
  identificationType: { id: 'checkout-card-document-type', placeholder: 'Tipo de documento' },
  identificationNumber: { id: 'checkout-card-document-number', placeholder: 'CPF ou CNPJ' },
  cardholderEmail: { id: 'checkout-card-email', placeholder: 'E-mail do pedido' },
};

export function MercadoPagoCardForm({
  reference,
  amount,
  publicKey,
  credentials,
  isPixAvailable,
  onAttemptFinished,
}: MercadoPagoCardFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const cardFormRef = useRef<MercadoPagoCardFormInstance | null>(null);
  const onAttemptFinishedRef = useRef(onAttemptFinished);
  const isSubmittingRef = useRef(false);
  const paymentInfoEmittedRef = useRef(false);
  const [formStatus, setFormStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOneTimePaymentAvailable, setIsOneTimePaymentAvailable] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [installmentSummary, setInstallmentSummary] = useState<string | null>(null);
  const [sdkRetryKey, setSdkRetryKey] = useState(0);

  const submitCardPayment = useCallback(async (): Promise<void> => {
    if (isSubmittingRef.current) return;

    const cardData = cardFormRef.current?.getCardFormData();
    const cardholderName = formRef.current
      ?.querySelector<HTMLInputElement>(`#${cardFormFields.cardholderName.id}`)
      ?.value.trim();
    const cardholderEmail = formRef.current
      ?.querySelector<HTMLInputElement>(`#${cardFormFields.cardholderEmail.id}`)
      ?.value.trim();
    const identificationType = cardData?.identificationType;
    const identificationNumber = cardData?.identificationNumber.replace(/\D/g, '');
    const installments = Number(cardData?.installments);
    const issuerId = Number(cardData?.issuerId);

    if (
      !cardData?.token ||
      !cardData.paymentMethodId ||
      !cardholderName ||
      !cardholderEmail ||
      !Number.isInteger(installments) ||
      installments < 1 ||
      (identificationType !== 'CPF' && identificationType !== 'CNPJ') ||
      !identificationNumber
    ) {
      setSubmitError('Confira os dados do cartão e do titular antes de continuar.');
      return;
    }

    if (!credentials) {
      setSubmitError('Esta sessão não tem a credencial para continuar o pagamento.');
      return;
    }

    isSubmittingRef.current = true;
    if (!paymentInfoEmittedRef.current) {
      paymentInfoEmittedRef.current = emitFunnelEvent({ event: 'add_payment_info', payment_type: 'card' });
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await crcnBackendApi.createCheckoutPayment(reference, credentials, amount, {
        paymentMethod: 'card',
        paymentMethodId: cardData.paymentMethodId,
        token: cardData.token,
        installments,
        cardholderName,
        cardholderEmail,
        ...(Number.isInteger(issuerId) && issuerId > 0 ? { issuerId } : {}),
        payerIdentification: {
          type: identificationType,
          number: identificationNumber,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.kind === 'response' && result.success) return;

      if (result.kind === 'not-found' && credentials.type === 'resume-token') {
        clearCheckoutResumeToken(reference);
      }

      setSubmitError(
        result.kind === 'response'
          ? result.message
          : 'Não foi possível iniciar o pagamento. Atualize o pedido antes de tentar novamente.',
      );
    } catch {
      setSubmitError(
        'Não foi possível iniciar o pagamento. Atualize o pedido antes de tentar novamente.',
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onAttemptFinishedRef.current();
    }
  }, [amount, credentials, reference]);

  useEffect(() => {
    onAttemptFinishedRef.current = onAttemptFinished;
  }, [onAttemptFinished]);

  useEffect(() => {
    let isCurrent = true;
    let cardForm: MercadoPagoCardFormInstance | null = null;
    setFormStatus('loading');
    setSubmitError(null);

    void loadMercadoPagoSdk()
      .then((MercadoPago) => {
        if (!isCurrent) return;

        const mercadoPago = new MercadoPago(publicKey, { locale: 'pt-BR' });
        cardForm = mercadoPago.cardForm({
          amount,
          iframe: true,
          form: { id: 'checkout-card-form', ...cardFormFields },
          callbacks: {
            onFormMounted: (error) => {
              if (!isCurrent) return;
              setFormStatus(error ? 'error' : 'ready');
            },
            onSubmit: (event) => {
              event.preventDefault();
              void submitCardPayment();
            },
            onInstallmentsReceived: (error, response) => {
              if (error || !response?.payer_costs?.length) {
                setInstallmentSummary(null);
                setIsOneTimePaymentAvailable(false);
                return;
              }

              const supportedInstallments = new Set(
                response.payer_costs
                  .map((cost) => Number(cost.installments))
                  .filter(
                    (installments) =>
                      Number.isInteger(installments) &&
                      installments >= 1 &&
                      installments <= maximumCardInstallments,
                  ),
              );
              const installmentsSelect = formRef.current?.querySelector<HTMLSelectElement>(
                `#${cardFormFields.installments.id}`,
              );

              if (installmentsSelect) {
                for (const option of Array.from(installmentsSelect.options)) {
                  const installments = Number(option.value);
                  if (
                    option.value !== '' &&
                    (!Number.isInteger(installments) || !supportedInstallments.has(installments))
                  ) {
                    option.remove();
                  }
                }
              }

              const selectedInstallments = supportedInstallments.values().next().value;
              if (selectedInstallments === undefined || !installmentsSelect) {
                setInstallmentSummary(null);
                setIsOneTimePaymentAvailable(false);
                return;
              }

              installmentsSelect.value = String(selectedInstallments);
              setIsOneTimePaymentAvailable(true);
              const selected = response.payer_costs.find(
                (cost) => Number(cost.installments) === selectedInstallments,
              );
              setInstallmentSummary(
                selected
                  ? `${selectedInstallments}x de ${moneyFormatter.format(selected.installment_amount)} · total ${moneyFormatter.format(selected.total_amount)}`
                  : null,
              );
            },
          },
        });
        cardFormRef.current = cardForm;
      })
      .catch(() => {
        if (isCurrent) setFormStatus('error');
      });

    return () => {
      isCurrent = false;
      cardForm?.unmount();
      cardFormRef.current = null;
    };
  }, [amount, publicKey, sdkRetryKey, submitCardPayment]);

  return (
    <section className="space-y-4" aria-labelledby="checkout-card-title">
      <div>
        <h3 id="checkout-card-title" className="font-extrabold text-neutral-950">
          Pagamento com cartão
        </h3>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          Os campos do cartão são fornecidos pelo Mercado Pago. Os dados do cartão não passam pelo
          site da CRCN.
        </p>
      </div>

      {formStatus === 'loading' && (
        <p className="text-sm text-neutral-600" role="status" aria-live="polite">
          Carregando os campos seguros do cartão…
        </p>
      )}
      {formStatus === 'error' && (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-rose-800">
            Não foi possível carregar o formulário de cartão. Tente novamente.
          </p>
          <button
            type="button"
            onClick={() => setSdkRetryKey((current) => current + 1)}
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Recarregar campos do cartão
          </button>
        </div>
      )}

      <form
        ref={formRef}
        id="checkout-card-form"
        aria-busy={isSubmitting || formStatus === 'loading'}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <p id={`${cardFormFields.cardNumber.id}-label`} className="block text-xs font-bold">
            Número do cartão
          </p>
          <div
            id={cardFormFields.cardNumber.id}
            role="group"
            aria-labelledby={`${cardFormFields.cardNumber.id}-label`}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 py-2.5"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p id={`${cardFormFields.expirationDate.id}-label`} className="block text-xs font-bold">
              Validade
            </p>
            <div
              id={cardFormFields.expirationDate.id}
              role="group"
              aria-labelledby={`${cardFormFields.expirationDate.id}-label`}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 py-2.5"
            />
          </div>
          <div className="space-y-1.5">
            <p id={`${cardFormFields.securityCode.id}-label`} className="block text-xs font-bold">
              Código de segurança
            </p>
            <div
              id={cardFormFields.securityCode.id}
              role="group"
              aria-labelledby={`${cardFormFields.securityCode.id}-label`}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 py-2.5"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={cardFormFields.cardholderName.id} className="block text-xs font-bold">
            Nome do titular
          </label>
          <input
            id={cardFormFields.cardholderName.id}
            type="text"
            autoComplete="cc-name"
            required
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={cardFormFields.issuer.id} className="block text-xs font-bold">
            Banco emissor
          </label>
          <select
            id={cardFormFields.issuer.id}
            required
            defaultValue=""
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            <option value="" disabled>
              Selecione o banco
            </option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={cardFormFields.installments.id} className="block text-xs font-bold">
            Parcelas
          </label>
          <select
            id={cardFormFields.installments.id}
            required
            defaultValue=""
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            <option value="" disabled>
              Selecione as parcelas
            </option>
          </select>
          {installmentSummary && (
            <p className="text-xs text-neutral-600" aria-live="polite">
              {installmentSummary}
            </p>
          )}
          {!isOneTimePaymentAvailable && formStatus === 'ready' && (
            <p className="text-xs text-neutral-600" role="status">
              {isPixAvailable
                ? 'Este cartão não oferece pagamento em uma parcela. Tente outro cartão ou escolha Pix.'
                : 'Este cartão não oferece pagamento em uma parcela. Tente outro cartão compatível.'}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={cardFormFields.identificationType.id}
              className="block text-xs font-bold"
            >
              Documento
            </label>
            <select
              id={cardFormFields.identificationType.id}
              required
              defaultValue=""
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <option value="" disabled>
                Tipo
              </option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor={cardFormFields.identificationNumber.id}
              className="block text-xs font-bold"
            >
              CPF ou CNPJ
            </label>
            <input
              id={cardFormFields.identificationNumber.id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              required
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={cardFormFields.cardholderEmail.id} className="block text-xs font-bold">
            E-mail do pedido
          </label>
          <input
            id={cardFormFields.cardholderEmail.id}
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          />
          <p className="text-xs text-neutral-600">
            Informe o mesmo e-mail usado ao criar o pedido.
          </p>
        </div>

        {submitError && (
          <p className="text-sm text-rose-800" role="alert">
            {submitError}
          </p>
        )}

        <button
          id="checkout-card-submit"
          type="submit"
          disabled={formStatus !== 'ready' || isSubmitting || !isOneTimePaymentAvailable}
          className="w-full rounded-full bg-neutral-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Enviando pagamento…' : 'Pagar com cartão'}
        </button>
      </form>
    </section>
  );
}
