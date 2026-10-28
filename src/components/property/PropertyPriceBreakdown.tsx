import type { Currency, Property } from '../../types';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { formatCurrency } from '../../utils/formatters';
import {
  getPropertyFeeAmount,
  getPropertyFeeLabel,
  isConfirmedPropertyQuote,
} from '../../utils/propertyPricing';
import type { calculatePropertyPricing } from '../../utils/propertyPricing';

interface PropertyPriceBreakdownProps {
  property: Pick<Property, 'pricePerNight'>;
  currency: Currency;
  nights: number;
  staysPrice: CalculatedPriceResponse | null;
  pricing: ReturnType<typeof calculatePropertyPricing>;
}

export function PropertyPriceBreakdown({
  property,
  currency,
  nights,
  staysPrice,
  pricing,
}: PropertyPriceBreakdownProps) {
  const { baseSubtotal, cleaningFee, serviceFee, totalAmount, visibleFees } = pricing;
  const confirmedQuote = isConfirmedPropertyQuote(staysPrice) ? staysPrice : null;

  if (!confirmedQuote && property.pricePerNight <= 0) return null;

  return (
    <div className="pt-3 border-t border-neutral-200/60 space-y-2.5 text-xs">
      <div className="flex items-center justify-between text-neutral-600">
        <span>
          {confirmedQuote?.breakdown?.dailyRateText ||
            `${formatCurrency(property.pricePerNight, currency)} x ${nights} noites`}
        </span>
        <span>{formatCurrency(baseSubtotal, currency)}</span>
      </div>

      {confirmedQuote && confirmedQuote.discount > 0 && (
        <div className="flex items-center justify-between text-neutral-600">
          <span>Desconto</span>
          <span className="font-semibold text-emerald-700">
            −{formatCurrency(confirmedQuote.discount, currency)}
          </span>
        </div>
      )}

      {confirmedQuote && visibleFees.length ? (
        visibleFees.map((fee, index) => (
          <div
            key={fee._id || index}
            className="flex items-center justify-between text-neutral-600"
          >
            <span>
              {getPropertyFeeLabel(fee)}
              {confirmedQuote.feesIncluded ? ' (incluída no total)' : ''}
            </span>
            <span>
              {formatCurrency(getPropertyFeeAmount(fee, confirmedQuote.currency), currency)}
            </span>
          </div>
        ))
      ) : confirmedQuote ? (
        <>
          {cleaningFee > 0 && (
            <div className="flex items-center justify-between text-neutral-600">
              <span>
                Taxa de limpeza{confirmedQuote.cleaningIncluded ? ' (incluída no total)' : ''}
              </span>
              <span>{formatCurrency(cleaningFee, currency)}</span>
            </div>
          )}
          {serviceFee > 0 && (
            <div className="flex items-center justify-between text-neutral-600">
              <span>Outras taxas incluídas na hospedagem</span>
              <span>{formatCurrency(serviceFee, currency)}</span>
            </div>
          )}
        </>
      ) : !confirmedQuote ? (
        <>
          {cleaningFee > 0 && (
            <div className="flex items-center justify-between text-neutral-600">
              <span>Taxa de limpeza estimada</span>
              <span>{formatCurrency(cleaningFee, currency)}</span>
            </div>
          )}
          {serviceFee > 0 && (
            <div className="flex items-center justify-between text-neutral-600">
              <span>Taxas de serviço estimadas</span>
              <span>{formatCurrency(serviceFee, currency)}</span>
            </div>
          )}
        </>
      ) : null}

      <div className="pt-3 border-t border-neutral-200 flex items-center justify-between font-bold text-sm text-neutral-900">
        <span>{confirmedQuote ? 'Total da estadia' : 'Estimativa'}</span>
        <span className="text-orange-600 text-base font-black">
          {formatCurrency(totalAmount, currency)}
        </span>
      </div>
    </div>
  );
}
