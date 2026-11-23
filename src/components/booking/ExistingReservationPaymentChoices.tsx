import type { Dispatch, SetStateAction } from 'react';
import { CreditCard, QrCode } from 'lucide-react';
import type { LegalPage } from '../../utils/legalPages';
import { CheckoutContractLink } from './CheckoutContractLink';
import type { ReservationSummary } from './existingReservationSummary';

type PaymentPlan = 'full' | 'deposit';
type PaymentMethod = 'pix' | 'card';

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function ExistingReservationPaymentChoices({
  summary,
  plan,
  setPlan,
  method,
  setMethod,
  planMethods,
  selectedAmountCents,
  outstandingBalanceCents,
  disabled,
  cardLabel,
  contract,
}: {
  summary: ReservationSummary;
  plan: PaymentPlan;
  setPlan: Dispatch<SetStateAction<PaymentPlan>>;
  method: PaymentMethod;
  setMethod: Dispatch<SetStateAction<PaymentMethod>>;
  planMethods: string[];
  selectedAmountCents: number | null;
  outstandingBalanceCents: number | null;
  disabled: boolean;
  cardLabel: string;
  contract: (LegalPage & { contentHash: string }) | null;
}) {
  const paymentPlans = summary.paymentPlans;

  return (
    <>
      {paymentPlans &&
        (paymentPlans.full.methods.length > 0 || paymentPlans.deposit.methods.length > 0) && (
          <fieldset disabled={disabled} className="mt-6 border-t border-slate-200 pt-9">
            <legend className="flex items-center gap-3 text-lg font-bold">
              <span className="checkout-section-number" aria-hidden="true">
                2
              </span>
              Quanto deseja pagar agora?
            </legend>
            <div className="mt-6 grid gap-3">
              {paymentPlans.full.methods.length > 0 && (
                <label
                  className={`checkout-payment-method cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 ${plan === 'full' ? '!border-orange-700 !bg-orange-50' : ''}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="existing-plan"
                    checked={plan === 'full'}
                    onChange={() => {
                      setPlan('full');
                      setMethod(paymentPlans.full.methods.includes('pix') ? 'pix' : 'card');
                    }}
                  />
                  <CreditCard size={21} aria-hidden="true" />
                  <span>
                    <strong>Quitar saldo restante agora</strong>
                    <small>
                      {money(
                        paymentPlans.full.amountCents ?? summary.candidateBalanceCents!,
                      )}
                    </small>
                  </span>
                </label>
              )}
              {paymentPlans.deposit.methods.length > 0 && (
                <label
                  className={`checkout-payment-method cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 ${plan === 'deposit' ? '!border-orange-700 !bg-orange-50' : ''}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="existing-plan"
                    checked={plan === 'deposit'}
                    onChange={() => {
                      setPlan('deposit');
                      setMethod('pix');
                    }}
                  />
                  <QrCode size={21} aria-hidden="true" />
                  <span>
                    <strong>Entrada de 50%</strong>
                    <small>
                      {money(
                        paymentPlans.deposit.amountCents ?? summary.candidateBalanceCents!,
                      )}{' '}
                      agora via Pix
                    </small>
                  </span>
                </label>
              )}
            </div>
            {plan === 'deposit' && (
              <div
                className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/75 p-4"
                aria-live="polite"
              >
                <h3 className="font-bold text-orange-950">Como funciona a entrada</h3>
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-6 text-orange-950/90">
                  <li>Agora você paga {money(selectedAmountCents ?? 0)} por Pix.</li>
                  <li>
                    O saldo restante
                    {outstandingBalanceCents !== null && selectedAmountCents !== null
                      ? ` de ${money(Math.max(0, outstandingBalanceCents - selectedAmountCents))}`
                      : ''}{' '}
                    deve ser pago, em regra, até um dia antes do check-in. Confira as condições da
                    reserva no contrato.
                  </li>
                  <li>
                    A reserva só fica quitada depois que o saldo for pago e confirmado.
                  </li>
                  <li>O voucher é liberado após a quitação integral.</li>
                </ul>
                {contract && (
                  <p className="mt-3 border-t border-orange-200 pt-3 text-xs leading-5 text-orange-950/80">
                    Confira os prazos e as orientações no{' '}
                    <CheckoutContractLink openInModal suppliedContract={contract} />.
                  </p>
                )}
              </div>
            )}
          </fieldset>
        )}
      <fieldset disabled={disabled} className="mt-6 border-t border-slate-200 pt-9">
        <legend className="flex items-center gap-3 text-lg font-bold">
          <span className="checkout-section-number" aria-hidden="true">
            3
          </span>
          {plan === 'deposit' ? 'Pagamento da entrada' : 'Como prefere pagar?'}
        </legend>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {planMethods.includes('pix') && (
            <label
              className={`checkout-payment-method cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 ${method === 'pix' ? '!border-orange-700 !bg-orange-50' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name="existing-method"
                checked={method === 'pix'}
                onChange={() => setMethod('pix')}
                aria-label="Pix"
              />
              <QrCode size={21} aria-hidden="true" />
              <span>
                <strong>Pix</strong>
                <small>Sem acréscimo</small>
              </span>
            </label>
          )}
          {planMethods.includes('card') && (
            <label
              className={`checkout-payment-method cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 ${method === 'card' ? '!border-orange-700 !bg-orange-50' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name="existing-method"
                checked={method === 'card'}
                onChange={() => setMethod('card')}
                aria-label={cardLabel}
              />
              <CreditCard size={21} aria-hidden="true" />
              <span>
                <strong>Cartão de crédito</strong>
                <small>{cardLabel}</small>
              </span>
            </label>
          )}
        </div>
      </fieldset>
    </>
  );
}
