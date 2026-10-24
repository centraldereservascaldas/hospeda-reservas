import type { Property } from '../types';

export type PropertyDisplayPrice =
  | { kind: 'quote'; amount: number; detail: string; dailyRate?: number }
  | { kind: 'reference'; amount: number; detail: string; note: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'pending'; message: string }
  | { kind: 'select-dates'; message: string }
  | { kind: 'no-price'; message: string };

export function getConfirmedPropertyQuote(
  property: Property,
): NonNullable<Property['calculatedPrice']> | null {
  const quote = property.calculatedPrice;
  if (!quote) return null;

  const hasValidAmounts =
    Number.isFinite(quote.totalAmount) &&
    quote.totalAmount > 0 &&
    Number.isFinite(quote.dailyRate) &&
    quote.dailyRate > 0 &&
    Number.isInteger(quote.nights) &&
    quote.nights > 0;

  return hasValidAmounts && quote.currency.trim().toUpperCase() === 'BRL' ? quote : null;
}

export function getPropertyDisplayPrice(
  property: Property,
  hasSearchDates: boolean,
  showTotalWithTaxes: boolean,
): PropertyDisplayPrice {
  const quote = getConfirmedPropertyQuote(property);
  const hasValidQuote = hasSearchDates && quote !== null;

  if (hasValidQuote && quote) {
    return {
      kind: 'quote',
      amount: showTotalWithTaxes ? quote.totalAmount : quote.dailyRate,
      detail: showTotalWithTaxes
        ? `Total da estadia • ${quote.nights} ${quote.nights === 1 ? 'noite' : 'noites'}`
        : '/ noite',
      ...(showTotalWithTaxes ? { dailyRate: quote.dailyRate } : {}),
    };
  }

  if (hasSearchDates) {
    return quote
      ? { kind: 'unavailable', message: 'Preço indisponível para estas datas' }
      : { kind: 'pending', message: 'Preço ainda não confirmado para esse período' };
  }

  if (quote) {
    return {
      kind: 'select-dates',
      message: 'Selecione as datas para consultar o preço atualizado',
    };
  }

  if (property.pricePerNight > 0) {
    return {
      kind: 'reference',
      amount: property.pricePerNight,
      detail: '/ noite',
      note: showTotalWithTaxes
        ? 'Pesquise as datas para ver o total da estadia'
        : 'Tarifa de referência; total depende das datas',
    };
  }

  return {
    kind: 'no-price',
    message: showTotalWithTaxes
      ? 'Pesquise as datas para ver o total da estadia'
      : 'Consulte as datas para ver o preço',
  };
}
