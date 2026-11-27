import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { checkoutApi } from '../../services/checkoutApi';
import { checkoutPathWithStayQuery } from '../../utils/checkoutUrl';
import { getOrCreateCheckoutSubmissionKey } from '../../utils/checkoutSubmissionStorage';
import { getOrCreateExistingCheckoutRecoverySecret } from '../../utils/existingReservationRecoveryStorage';
import { saveCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { isValidBrazilianTaxId, isValidCpf } from '../../utils/cpf';
import { saveExistingReservationResumeReference } from '../../utils/existingReservationResumeStorage';
import { getPixPayerIdentification } from './PixPayerIdentificationField';
import type { CieloCardPricing, CieloPaymentContext } from './CieloSopCardForm';
import type { ReservationSummary } from './existingReservationSummary';

interface GuestDetails {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
}

interface CheckoutContract {
  version: string;
  contentHash: string;
}

interface UseExistingReservationPaymentPreparationOptions {
  code: string;
  accessToken: string | null;
  renewalGeneration: string | null;
  recoveryState: 'checking' | 'clear' | 'error';
  summary: ReservationSummary | null;
  contract: CheckoutContract | null;
  canPay: boolean;
  planMethods: string[];
  method: 'pix' | 'card';
  plan: 'full' | 'deposit';
  guest: GuestDetails;
  accepted: boolean;
  onAcceptanceReset: Dispatch<SetStateAction<boolean>>;
  selectedAmountCents: number | null;
  cardPricing: CieloCardPricing | null;
  pixDocument: string;
}

export function useExistingReservationPaymentPreparation({
  code,
  accessToken,
  renewalGeneration,
  recoveryState,
  summary,
  contract,
  canPay,
  planMethods,
  method,
  plan,
  guest,
  accepted,
  onAcceptanceReset,
  selectedAmountCents,
  cardPricing,
  pixDocument,
}: UseExistingReservationPaymentPreparationOptions) {
  const [prepared, setPrepared] = useState(false);
  const [paymentReviewRequired, setPaymentReviewRequired] = useState(false);
  const [activeReference, setActiveReference] = useState<string | null>(null);
  const contextRef = useRef<CieloPaymentContext | null>(null);
  const pixKeyRef = useRef<string | null>(null);

  const preparePayment = async (): Promise<CieloPaymentContext> => {
    if (contextRef.current) return contextRef.current;
    if (
      recoveryState !== 'clear' ||
      !accessToken ||
      !summary ||
      !contract ||
      !canPay ||
      !planMethods.includes(method) ||
      !isValidCpf(guest.cpf) ||
      !selectedAmountCents ||
      !summary.listingId ||
      !summary.checkIn ||
      !summary.checkOut ||
      !accepted
    ) {
      throw new Error('Confira os dados e aceite o valor do pagamento antes de continuar.');
    }
    const payer = {
      fullName: guest.fullName.trim(),
      cpf: guest.cpf.replace(/\D/g, ''),
      email: guest.email.trim(),
      phone: guest.phone.trim(),
    };
    const idempotencyKey = await getOrCreateCheckoutSubmissionKey(
      {
        listingId: `${code}:${summary.listingId}:${plan}:${method}:${method === 'card' ? (cardPricing?.installments ?? 'unavailable') : 'single'}`,
        from: summary.checkIn,
        to: summary.checkOut,
        guests: {
          adults: summary.adults ?? 0,
          children: summary.children ?? 0,
          infants: summary.infants ?? 0,
          pets: 0,
        },
        quoteTotal: selectedAmountCents / 100,
        guest: payer,
        acceptedTermsVersion: `contract:${contract.contentHash}`,
        acceptedTerms: true,
      },
      renewalGeneration ? `existing-reservation-renewal:${code}:${renewalGeneration}` : undefined,
    );
    let response: Response;
    let data: unknown;
    const recoverySecret = await getOrCreateExistingCheckoutRecoverySecret(code, renewalGeneration, accessToken!);
    try {
      response = await apiFetch(`/api/existing-reservations/${encodeURIComponent(code)}/checkout`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Checkout-Recovery-Secret': recoverySecret,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          expectedBalanceCents: summary.candidateBalanceCents,
          guest: payer,
          acceptedPayment: true,
          acceptedContract: { version: contract.version, contentHash: contract.contentHash },
          paymentMethod: method,
          paymentPlan: plan,
          ...(method === 'card' ? { installments: cardPricing?.installments } : {}),
        }),
      });
      data = await response.json();
    } catch {
      throw new Error(
        'Não foi possível confirmar o preparo do pagamento. Tente novamente sem alterar os dados ou fale com nosso atendimento.',
      );
    }
    if (!response.ok && data && typeof data === 'object' && 'code' in data) {
      if (data.code === 'existing_contract_changed' || data.code === 'existing_contract_required') {
        onAcceptanceReset(false);
        throw new Error(
          'O contrato foi atualizado. Atualize a página e confira as condições antes de continuar.',
        );
      }
      if (data.code === 'existing_checkout_already_started') {
        setPaymentReviewRequired(true);
        throw new Error(
          'Encontramos um pagamento anterior que ainda não foi encerrado com segurança. Não faça outra cobrança; acompanhe o pedido ou fale com nosso atendimento.',
        );
      }
      if (data.code === 'existing_receivable_unconfirmed') {
        setPaymentReviewRequired(true);
        throw new Error(
          'O registro desta reserva está em conferência. Fale com nosso atendimento antes de iniciar outro pagamento.',
        );
      }
    }
    if (
      !response.ok ||
      !data ||
      typeof data !== 'object' ||
      !('success' in data) ||
      data.success !== true ||
      !('resume' in data) ||
      !data.resume ||
      typeof data.resume !== 'object' ||
      !('order' in data) ||
      !data.order ||
      typeof data.order !== 'object' ||
      !('payment' in data) ||
      !data.payment ||
      typeof data.payment !== 'object'
    ) {
      throw new Error(
        'Não foi possível preparar o pagamento. Confira o saldo com nosso atendimento.',
      );
    }
    const resume = data.resume as Record<string, unknown>;
    const order = data.order as Record<string, unknown>;
    const payment = data.payment as Record<string, unknown>;
    if (
      typeof resume.reference !== 'string' ||
      !/^[A-Za-z0-9]{40}$/.test(resume.reference) ||
      typeof resume.token !== 'string' ||
      !/^[A-Za-z0-9]{64}$/.test(resume.token) ||
      typeof resume.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(resume.expiresAt)) ||
      Date.parse(resume.expiresAt) <= Date.now() ||
      resume.path !== `/checkout/${resume.reference}` ||
      order.publicReference !== resume.reference ||
      typeof order.status !== 'string' ||
      typeof order.quoteTotal !== 'string' ||
      Math.round(Number(order.quoteTotal) * 100) !== selectedAmountCents ||
      !['cielo', 'cielo_sandbox'].includes(String(payment.provider))
    ) {
      throw new Error('O pedido precisa de conferência antes de iniciar o pagamento.');
    }
    saveCheckoutResumeToken(resume.reference, resume.token, resume.expiresAt);
    saveExistingReservationResumeReference(code, resume.reference);
    const context: CieloPaymentContext = {
      reference: resume.reference,
      amount: order.quoteTotal,
      credentials: { type: 'resume-token', resumeToken: resume.token },
    };
    window.history.replaceState(
      null,
      '',
      checkoutPathWithStayQuery(resume.path, window.location.search),
    );
    const orderCanStartPayment =
      (order.status === 'pre_reservado' &&
        (order.paymentStatus === null || order.paymentStatus === 'not_started')) ||
      (order.status === 'pagamento_recusado' &&
        (order.paymentStatus === 'rejected' || order.paymentStatus === 'cancelled'));
    if (!orderCanStartPayment || payment.enabled !== true) {
      setActiveReference(context.reference);
      throw new Error('Acompanhe a situação deste pedido antes de tentar novamente.');
    }
    contextRef.current = context;
    setPrepared(true);
    return context;
  };

  const showPaymentStatus = () => {
    if (contextRef.current) setActiveReference(contextRef.current.reference);
  };

  const startPix = async () => {
    const identification = getPixPayerIdentification(pixDocument, true);
    if (!identification || !isValidBrazilianTaxId(identification.number)) {
      throw new Error('Informe um CPF ou CNPJ válido de quem vai pagar o Pix.');
    }
    const context = await preparePayment();
    pixKeyRef.current ??= crypto.randomUUID();
    const result = await checkoutApi.createCheckoutPayment(
      context.reference,
      context.credentials,
      context.amount,
      {
        paymentMethod: 'pix',
        paymentMethodId: 'pix',
        payerIdentification: identification,
        idempotencyKey: pixKeyRef.current,
      },
    );
    if (result.kind !== 'response' || !result.success) {
      showPaymentStatus();
      throw new Error(
        'Estamos conferindo a tentativa. Acompanhe o pedido antes de tentar novamente.',
      );
    }
    showPaymentStatus();
  };

  return {
    activeReference,
    paymentReviewRequired,
    prepared,
    preparePayment,
    showPaymentStatus,
    startPix,
  };
}
