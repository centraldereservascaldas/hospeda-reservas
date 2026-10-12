import type { CalculatedPriceResponse } from '../services/crcnBackendApi';

type PropertyPricingInput = {
  nightlyRate: number;
  cleaningFee: number;
  serviceFeeRate: number;
  nights: number;
  quote: CalculatedPriceResponse | null;
};

export function calculatePropertyPricing({
  nightlyRate,
  cleaningFee,
  serviceFeeRate,
  nights,
  quote,
}: PropertyPricingInput) {
  const baseSubtotal = quote ? quote.baseTotal : nightlyRate * nights;
  const discount = quote ? quote.discount : 0;
  const calculatedCleaningFee = quote ? quote.cleaningFee : cleaningFee;
  const serviceFee = quote
    ? quote.serviceFee
    : Math.round((baseSubtotal - discount) * serviceFeeRate);
  const totalAmount = quote
    ? quote.total
    : baseSubtotal - discount + calculatedCleaningFee + serviceFee;
  const visibleFees = quote?.fees?.filter((fee) => !isCounterFee(fee)) || [];

  return {
    baseSubtotal,
    discount,
    cleaningFee: calculatedCleaningFee,
    serviceFee,
    totalAmount,
    visibleFees,
  };
}

export function getPropertyFeeLabel(
  fee: NonNullable<CalculatedPriceResponse['fees']>[number],
): string {
  return fee._mstitle?.pt_BR || fee._mstitle?.pt_PT || fee.internalName || 'Taxa da hospedagem';
}

export function getPropertyFeeAmount(
  fee: NonNullable<CalculatedPriceResponse['fees']>[number],
  currency: string,
): number {
  return Number(fee._mcval?.[currency] ?? fee._mcval?.BRL ?? 0);
}

function isCounterFee(fee: NonNullable<CalculatedPriceResponse['fees']>[number]): boolean {
  return /balc[aã]o|counter/i.test(
    `${fee.internalName || ''} ${fee._mstitle?.pt_BR || ''} ${fee._mstitle?.pt_PT || ''}`,
  );
}
