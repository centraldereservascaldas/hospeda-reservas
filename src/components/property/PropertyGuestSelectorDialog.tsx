import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus';

interface PropertyGuestSelectorDialogProps {
  isOpen: boolean;
  position: { top: number; left: number; width: number };
  guestLimit: number;
  adults: number;
  children: number;
  infants: number;
  onAdultsChange: React.Dispatch<React.SetStateAction<number>>;
  onChildrenChange: React.Dispatch<React.SetStateAction<number>>;
  onInfantsChange: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
}

export const PropertyGuestSelectorDialog: React.FC<PropertyGuestSelectorDialogProps> = ({
  isOpen,
  position,
  guestLimit,
  adults,
  children,
  infants,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onClose,
}) => {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });

  const guestCounter = (
    label: string,
    value: number,
    minimum: number,
    maximum: number,
    setValue: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    const safeMaximum = Math.max(minimum, maximum);
    return (
      <div className="flex items-center justify-between gap-2 py-2 sm:gap-4">
        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-neutral-800">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={value <= minimum}
            aria-label={`Remover: ${label}`}
            onClick={() => setValue((count) => Math.max(minimum, count - 1))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-lg text-neutral-700 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            −
          </button>
          <span
            aria-label={`${label}: ${value}`}
            aria-live="polite"
            className="w-5 text-center text-sm font-bold text-neutral-900"
          >
            {value}
          </span>
          <button
            type="button"
            disabled={value >= safeMaximum}
            aria-label={`Adicionar: ${label}`}
            onClick={() => setValue((count) => Math.min(safeMaximum, count + 1))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-lg text-neutral-700 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[70] bg-transparent"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <div
        ref={dialogRef}
        data-dialog-focus-root
        id="property-guest-selector-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-selector-title"
        tabIndex={-1}
        className="property-guest-selector fixed z-[71] flex flex-col rounded-3xl border border-white/90 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: 'calc(100dvh - 16px)',
        }}
      >
        <div className="z-10 -mx-5 -mt-5 mb-2 flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-5 pt-5 pb-3 backdrop-blur-2xl">
          <div className="min-w-0 flex-1">
            <h2 id="guest-selector-title" className="text-base font-bold text-neutral-900">
              Hóspedes
            </h2>
            <p className="mt-0.5 break-words text-caption leading-snug text-neutral-500">
              Limite de {guestLimit} hóspede{guestLimit === 1 ? '' : 's'} na acomodação
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar seletor de hóspedes"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="property-guest-selector-list min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {guestCounter('Adultos', adults, 1, guestLimit - children - infants, onAdultsChange)}
          {guestCounter(
            'Crianças (2–12 anos)',
            children,
            0,
            guestLimit - adults - infants,
            onChildrenChange,
          )}
          {guestCounter(
            'Bebês (até 2 anos)',
            infants,
            0,
            Math.min(5, guestLimit - adults - children),
            onInfantsChange,
          )}
        </div>
        <div className="mt-2 shrink-0 border-t border-neutral-100 pt-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full bg-orange-50 px-5 py-2 text-xs font-bold text-orange-800 transition hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            Aplicar
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};
