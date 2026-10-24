import type { CalculatedPriceResponse } from '../services/crcnBackendApi';

type PropertyPricingInput = {
  nightlyRate: number;
  cleaningFee: number;
  serviceFeeRate: number;
  nights: number;
  quote: CalculatedPriceResponse | null;
};

export function isConfirmedPropertyQuote(
  quote: CalculatedPriceResponse | null,
): quote is CalculatedPriceResponse {
  return Boolean(
    quote?.success &&
    (quote.source === 'stays-live' || quote.source === 'stays-simulated') &&
    quote.currency === 'BRL' &&
    Number.isFinite(quote.total) &&
    quote.total > 0 &&
    Number.isFinite(quote.dailyRate) &&
    quote.dailyRate > 0 &&
    Number.isInteger(quote.nights) &&
    quote.nights > 0,
  );
}

export function calculatePropertyPricing({
  nightlyRate,
  cleaningFee,
  serviceFeeRate,
  nights,
  quote,
}: PropertyPricingInput) {
  const confirmedQuote = isConfirmedPropertyQuote(quote) ? quote : null;
  const baseSubtotal = confirmedQuote ? confirmedQuote.baseTotal : nightlyRate * nights;
  const discount = confirmedQuote ? confirmedQuote.discount : 0;
  const calculatedCleaningFee = confirmedQuote ? confirmedQuote.cleaningFee : cleaningFee;
  const serviceFee = confirmedQuote
    ? confirmedQuote.serviceFee
    : Math.round((baseSubtotal - discount) * serviceFeeRate);
  const totalAmount = confirmedQuote
    ? confirmedQuote.total
    : baseSubtotal - discount + calculatedCleaningFee + serviceFee;
  const visibleFees = getVisiblePropertyFees(confirmedQuote?.fees || []);

  return {
    baseSubtotal,
    discount,
    cleaningFee: calculatedCleaningFee,
    serviceFee,
    totalAmount,
    visibleFees,
  };
}

export function getVisiblePropertyFees(
  fees: NonNullable<CalculatedPriceResponse['fees']>,
): NonNullable<CalculatedPriceResponse['fees']> {
  return fees.filter((fee) => !isCounterFee(fee));
}

export function getPropertyFeeLabel(
  fee: NonNullable<CalculatedPriceResponse['fees']>[number],
): string {
  return (
    fee._mstitle?.pt_BR ||
    fee._mstitle?.pt_PT ||
    fee._mstitle?.en_US ||
    fee.internalName ||
    'Taxa da hospedagem'
  );
}

export function getPropertyFeeAmount(
  fee: NonNullable<CalculatedPriceResponse['fees']>[number],
  currency: string,
): number {
  return Number(fee._mcval?.[currency] ?? fee._mcval?.BRL ?? 0);
}

function isCounterFee(fee: NonNullable<CalculatedPriceResponse['fees']>[number]): boolean {
  return /balc[aã]o|counter/i.test(
    `${fee.internalName || ''} ${fee._mstitle?.pt_BR || ''} ${fee._mstitle?.pt_PT || ''} ${fee._mstitle?.en_US || ''}`,
  );
}
