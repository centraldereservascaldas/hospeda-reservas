import React, { useId, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { SearchFilters, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { useDialogFocus } from './useDialogFocus';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApplyFilters: (filters: SearchFilters) => void;
  onResetFilters: () => void;
  currency: Currency;
  matchingCount: number;
}

const AVAILABLE_AMENITIES = [
  'Wi-Fi',
  'Piscina',
  'Ar-condicionado',
  'Jacuzzi',
  'Cozinha',
  'Lareira',
  'Estacionamento',
  'Churrasqueira',
  'Aceita pets',
  'Vista para o mar',
  'Café da manhã incluso',
  'Pé na areia',
];

const PROPERTY_TYPES = [
  { id: 'all', title: 'Qualquer tipo', desc: 'Casas, vilas, cabanas e flats' },
  { id: 'entire_place', title: 'Espaço inteiro', desc: 'Um lugar só para você e seu grupo' },
  { id: 'cabin', title: 'Cabanas & Chalés', desc: 'Refúgios na montanha ou floresta' },
  { id: 'villa', title: 'Vilas de luxo', desc: 'Espaços amplos com serviços exclusivos' },
];

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  currency,
  matchingCount,
}) => {
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });
  const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600';
  const [minPrice, setMinPrice] = useState(filters.minPrice);
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(filters.propertyTypes);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(filters.amenities);
  const [minBedrooms, setMinBedrooms] = useState(filters.minBedrooms);
  const [minBaths, setMinBaths] = useState(filters.minBaths);
  const [superhostOnly, setSuperhostOnly] = useState(filters.superhostOnly);
  const [instantBookOnly, setInstantBookOnly] = useState(filters.instantBookOnly);

  if (!isOpen) return null;

  const toggleType = (id: string) => {
    if (id === 'all') {
      setSelectedTypes([]);
      return;
    }
    if (selectedTypes.includes(id)) {
      setSelectedTypes(selectedTypes.filter((t) => t !== id));
    } else {
      setSelectedTypes([...selectedTypes, id]);
    }
  };

  const toggleAmenity = (amenity: string) => {
    if (selectedAmenities.includes(amenity)) {
      setSelectedAmenities(selectedAmenities.filter((a) => a !== amenity));
    } else {
      setSelectedAmenities([...selectedAmenities, amenity]);
    }
  };

  const handleApply = () => {
    onApplyFilters({
      ...filters,
      minPrice,
      maxPrice,
      propertyTypes: selectedTypes,
      amenities: selectedAmenities,
      minBedrooms,
      minBaths,
      superhostOnly,
      instantBookOnly,
    });
    onClose();
  };

  const handleClear = () => {
    setMinPrice(0);
    setMaxPrice(5000);
    setSelectedTypes([]);
    setSelectedAmenities([]);
    setMinBedrooms(0);
    setMinBaths(0);
    setSuperhostOnly(false);
    setInstantBookOnly(false);
    onResetFilters();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        data-dialog-focus-root
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        tabIndex={-1}
        className="w-full max-w-2xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl border border-neutral-200/90 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 bg-white/95 backdrop-blur-md flex items-center justify-between">
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar filtros"
            onClick={onClose}
            className={`w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer shadow-2xs ${focusRing}`}
          >
            <X className="w-5 h-5" />
          </button>
          <h2 id={`${fieldId}-title`} className="text-base font-extrabold text-neutral-900">Filtros</h2>
          <div className="w-8" /> {/* spacer */}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-8 divide-y divide-neutral-100">
          
          {/* Price Range */}
          <div>
            <h3 className="text-base font-bold text-neutral-900 mb-1">Faixa de preço</h3>
            <p className="text-xs text-neutral-500 mb-4">Preço por noite antes de taxas</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-neutral-300 rounded-2xl p-3 focus-within:border-neutral-900 transition-colors">
                <label htmlFor={`${fieldId}-min-price`} className="text-[10px] uppercase font-bold text-neutral-600 block">Preço mínimo por noite</label>
                <div className="flex items-center gap-1 font-semibold text-neutral-900">
                  <span className="text-xs text-neutral-500">R$</span>
                  <input
                    id={`${fieldId}-min-price`}
                    type="number"
                    min="0"
                    max={maxPrice}
                    value={minPrice}
                    onChange={(e) => setMinPrice(Number(e.target.value))}
                    className="w-full text-sm outline-none font-bold focus-visible:ring-2 focus-visible:ring-orange-600"
                  />
                </div>
              </div>

              <div className="border border-neutral-300 rounded-2xl p-3 focus-within:border-neutral-900 transition-colors">
                <label htmlFor={`${fieldId}-max-price`} className="text-[10px] uppercase font-bold text-neutral-600 block">Preço máximo por noite</label>
                <div className="flex items-center gap-1 font-semibold text-neutral-900">
                  <span className="text-xs text-neutral-500">R$</span>
                  <input
                    id={`${fieldId}-max-price`}
                    type="number"
                    min={minPrice}
                    max="15000"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-full text-sm outline-none font-bold focus-visible:ring-2 focus-visible:ring-orange-600"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
              <span>{formatCurrency(minPrice, currency)} / noite</span>
              <span>{formatCurrency(maxPrice, currency)} / noite</span>
            </div>
          </div>

          {/* Type of place */}
          <div className="pt-6">
            <h3 className="text-base font-bold text-neutral-900 mb-4">Tipo de acomodação</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROPERTY_TYPES.map((type) => {
                const isSelected = type.id === 'all' 
                  ? selectedTypes.length === 0 
                  : selectedTypes.includes(type.id);
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleType(type.id)}
                    className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${focusRing} ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <p className="text-sm font-semibold text-neutral-900">{type.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{type.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rooms and Beds */}
          <div className="pt-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Quartos e banheiros</h3>
            
            <div>
              <p id={`${fieldId}-bedrooms-label`} className="text-xs font-semibold text-neutral-700 mb-2">Quartos mínimos</p>
              <div role="group" aria-labelledby={`${fieldId}-bedrooms-label`} className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {[0, 1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    aria-pressed={minBedrooms === num}
                    onClick={() => setMinBedrooms(num)}
                    className={`min-w-12 h-10 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer flex-shrink-0 ${focusRing} ${
                      minBedrooms === num
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'border-neutral-200 text-neutral-700 hover:border-neutral-900'
                    }`}
                  >
                    {num === 0 ? 'Qualquer' : `${num}+`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p id={`${fieldId}-baths-label`} className="text-xs font-semibold text-neutral-700 mb-2">Banheiros mínimos</p>
              <div role="group" aria-labelledby={`${fieldId}-baths-label`} className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {[0, 1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    aria-pressed={minBaths === num}
                    onClick={() => setMinBaths(num)}
                    className={`min-w-12 h-10 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer flex-shrink-0 ${focusRing} ${
                      minBaths === num
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'border-neutral-200 text-neutral-700 hover:border-neutral-900'
                    }`}
                  >
                    {num === 0 ? 'Qualquer' : `${num}+`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Amenities */}
          <div className="pt-6">
            <h3 className="text-base font-bold text-neutral-900 mb-3">Comodidades populares</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {AVAILABLE_AMENITIES.map((amenity) => {
                const isSelected = selectedAmenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleAmenity(amenity)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer ${focusRing} ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-sm flex items-center justify-center border ${
                      isSelected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{amenity}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Booking Options */}
          <div className="pt-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Opções de reserva</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <p id={`${fieldId}-instant-book-label`} className="text-sm font-semibold text-neutral-900">Reserva Imediata</p>
                <p id={`${fieldId}-instant-book-description`} className="text-xs text-neutral-500">Espaços que você pode reservar sem esperar aprovação</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={instantBookOnly}
                aria-labelledby={`${fieldId}-instant-book-label`}
                aria-describedby={`${fieldId}-instant-book-description`}
                onClick={() => setInstantBookOnly(!instantBookOnly)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${focusRing} ${
                  instantBookOnly ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    instantBookOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p id={`${fieldId}-superhost-label`} className="text-sm font-semibold text-neutral-900">Apenas Superhosts</p>
                <p id={`${fieldId}-superhost-description`} className="text-xs text-neutral-500">Hospede-se com anfitriões reconhecidos por excelência</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={superhostOnly}
                aria-labelledby={`${fieldId}-superhost-label`}
                aria-describedby={`${fieldId}-superhost-description`}
                onClick={() => setSuperhostOnly(!superhostOnly)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${focusRing} ${
                  superhostOnly ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    superhostOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/60 flex items-center justify-between">
          <button
            onClick={handleClear}
            className={`text-xs font-semibold text-neutral-700 underline hover:text-neutral-900 cursor-pointer ${focusRing}`}
          >
            Limpar tudo
          </button>

          <button
            onClick={handleApply}
            className={`px-6 py-3 rounded-full bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95 ${focusRing}`}
          >
            Mostrar {matchingCount} acomodações
          </button>
        </div>

      </div>
    </div>
  );
};
