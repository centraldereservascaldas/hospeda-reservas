import type { Currency, Property } from '../../types';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { formatCurrency } from '../../utils/formatters';
import { getPropertyFeeAmount, getPropertyFeeLabel } from '../../utils/propertyPricing';
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
  const { baseSubtotal, discount, cleaningFee, serviceFee, totalAmount, visibleFees } = pricing;

  return (
    <div className="pt-3 border-t border-neutral-200/60 space-y-2.5 text-xs">
      <div className="flex items-center justify-between text-neutral-600">
        <span>
          {staysPrice?.breakdown?.dailyRateText ||
            `${formatCurrency(property.pricePerNight, currency)} x ${nights} noites`}
        </span>
        <span>{formatCurrency(baseSubtotal, currency)}</span>
      </div>

      {staysPrice?.source !== 'stays-live' && discount > 0 && (
        <div className="flex items-center justify-between text-emerald-600 font-semibold">
          <span>Desconto de estadia</span>
          <span>-{formatCurrency(discount, currency)}</span>
        </div>
      )}

      {staysPrice?.source === 'stays-live' ? (
        staysPrice.cleaningFee > 0 && (
          <div className="flex items-center justify-between text-neutral-600">
            <span>Taxa de limpeza{staysPrice.cleaningIncluded ? ' (incluída na diária)' : ''}</span>
            <span>{formatCurrency(staysPrice.cleaningFee, currency)}</span>
          </div>
        )
      ) : visibleFees.length ? (
        visibleFees.map((fee, index) => (
          <div
            key={fee._id || index}
            className="flex items-center justify-between text-neutral-600"
          >
            <span>
              {getPropertyFeeLabel(fee)}
              {staysPrice?.feesIncluded ? ' (incluída na diária)' : ''}
            </span>
            <span>
              {formatCurrency(getPropertyFeeAmount(fee, staysPrice?.currency || 'BRL'), currency)}
            </span>
          </div>
        ))
      ) : !staysPrice?.fees?.length ? (
        <>
          <div className="flex items-center justify-between text-neutral-600">
            <span>
              {staysPrice?.breakdown?.cleaningFeeText || 'Taxa de limpeza & higienização'}
            </span>
            <span>{formatCurrency(cleaningFee, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-600">
            <span>
              {staysPrice?.breakdown?.serviceFeeText || 'Taxa de serviço Central de Reservas'}
            </span>
            <span>{formatCurrency(serviceFee, currency)}</span>
          </div>
        </>
      ) : null}

      <div className="pt-3 border-t border-neutral-200 flex items-center justify-between font-bold text-sm text-neutral-900">
        <span>{staysPrice?.source === 'stays-live' ? 'Total da estadia' : 'Estimativa'}</span>
        <span className="text-orange-600 text-base font-black">
          {formatCurrency(totalAmount, currency)}
        </span>
      </div>
    </div>
  );
}
