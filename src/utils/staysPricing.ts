export type StaysFee = {
  _id?: string;
  internalName?: string;
  _mstitle?: Record<string, string>;
  _mcval?: Record<string, number>;
};

export type NormalizedStaysQuote = {
  nights: number;
  dailyRate: number;
  baseTotal: number;
  cleaningFee: number;
  serviceFee: number;
  discount: number;
  total: number;
  currency: string;
  feesIncluded: boolean;
  fees: StaysFee[];
  cleaningIncluded: boolean;
};

export const hasQuoteChanged = (quotedTotal: number, currentTotal: number) =>
  !Number.isFinite(quotedTotal) || !Number.isFinite(currentTotal) ||
  Math.round(quotedTotal * 100) !== Math.round(currentTotal * 100);

const localizedText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const translations = value as Record<string, unknown>;
  return String(translations.pt_BR || translations.pt_PT || translations.en_US || '');
};

const amountBRL = (value: unknown): number => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const rawAmount = (value as Record<string, unknown>).BRL;
  const amount = typeof rawAmount === 'number' || typeof rawAmount === 'string' ? Number(rawAmount) : Number.NaN;
  return Number.isFinite(amount) ? amount : 0;
};

const normalizedFee = (value: unknown): StaysFee | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fee = value as Record<string, unknown>;
  const translations = fee._mstitle && typeof fee._mstitle === 'object' && !Array.isArray(fee._mstitle)
    ? Object.fromEntries(Object.entries(fee._mstitle).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;
  const values = fee._mcval && typeof fee._mcval === 'object' && !Array.isArray(fee._mcval)
    ? Object.fromEntries(Object.entries(fee._mcval).flatMap(([currency, amount]) => {
      const numericAmount = Number(amount);
      return Number.isFinite(numericAmount) ? [[currency, numericAmount]] : [];
    }))
    : undefined;
  if (!values || typeof values.BRL !== 'number') return null;
  return {
    ...(typeof fee._id === 'string' ? { _id: fee._id } : {}),
    ...(typeof fee.internalName === 'string' ? { internalName: fee.internalName } : {}),
    ...(translations ? { _mstitle: translations } : {}),
    ...(values ? { _mcval: values } : {}),
  };
};

export function normalizeStaysQuote(price: unknown, nights: number): NormalizedStaysQuote | null {
  if (!price || typeof price !== 'object' || Array.isArray(price)) return null;
  const quote = price as Record<string, unknown>;
  const total = amountBRL(quote._mctotal);
  if (!Number.isFinite(total) || total <= 0 || nights < 1 || typeof quote.feesIncluded !== 'boolean') return null;

  const fees: StaysFee[] = Array.isArray(quote.fees)
    ? quote.fees.map(normalizedFee).filter((fee): fee is StaysFee => fee !== null)
    : [];
  const feeAmount = (fee: StaysFee) => amountBRL(fee._mcval);
  const label = (fee: StaysFee) => `${fee.internalName || ''} ${localizedText(fee._mstitle)}`;
  const isCleaningFee = (fee: StaysFee) => /clean|limpez/i.test(label(fee));
  const cleaningFee = fees.filter(isCleaningFee).reduce((sum, fee) => sum + feeAmount(fee), 0);
  const serviceFee = fees
    .filter((fee) => /service|servi/i.test(label(fee)))
    .reduce((sum, fee) => sum + feeAmount(fee), 0);
  const allFees = fees.reduce((sum, fee) => sum + feeAmount(fee), 0);
  const feesIncluded = quote.feesIncluded === true;
  const finalTotal = feesIncluded ? total : total + allFees;

  // All non-cleaning fees (including the account-specific counter fee) are
  // folded into the nightly amount; cleaning remains an explicit item only
  // when Stays says that it is not already included in the quote total.
  const baseTotal = feesIncluded
    ? total
    : total + Math.max(0, allFees - cleaningFee);

  return {
    nights,
    dailyRate: baseTotal / nights,
    baseTotal,
    cleaningFee,
    serviceFee,
    // The PMS total is already final; don't publish a discount unless the API
    // also supplies a verifiable gross amount for the undiscounted stay.
    discount: 0,
    total: finalTotal,
    currency: typeof quote.mainCurrency === 'string' ? quote.mainCurrency : 'BRL',
    feesIncluded,
    fees: fees.filter(isCleaningFee),
    cleaningIncluded: feesIncluded && cleaningFee > 0,
  };
}
