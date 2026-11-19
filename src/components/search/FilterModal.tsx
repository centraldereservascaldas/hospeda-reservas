import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Currency, Property, SearchFilters } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { filterPropertiesBySearchFilters } from '../../utils/propertySearchFilters';
import { getAmenityFilterIdentity, getCatalogAmenities } from '../../utils/propertyAmenities';
import { useDialogFocus } from '../useDialogFocus';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  properties: Property[];
  amenityProperties?: Property[];
  hasMoreSearchResults?: boolean;
  onApplyFilters: (filters: SearchFilters) => void;
  onResetFilters: () => void;
  currency: Currency;
}

function useSelectedOptionBounds(selectedValue: string, options: number) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const update = () => {
      const selectedButton = [
        ...group.querySelectorAll<HTMLButtonElement>('[data-shared-option]'),
      ].find((button) => button.dataset.sharedOption === selectedValue);
      if (!selectedButton) return;

      const groupRect = group.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();
      setBounds({
        left: buttonRect.left - groupRect.left,
        top: buttonRect.top - groupRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        ready: true,
      });
    };

    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(group);
    return () => observer.disconnect();
  }, [options, selectedValue]);

  return { groupRef, bounds };
}

function getAvailableAmenities(properties: Property[], selectedAmenities: string[]): string[] {
  const options = new Map<string, { label: string; count: number }>();

  for (const property of properties) {
    const amenities = getCatalogAmenities(
      property.amenities,
      property.listingAmenities,
      property.propertyAmenities,
    );
    for (const amenity of amenities) {
      const label = amenity.trim();
      const identity = getAmenityFilterIdentity(label);
      if (!label || label.length > 80 || !identity) continue;
      const current = options.get(identity);
      options.set(identity, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
    }
  }

  for (const amenity of selectedAmenities) {
    const label = amenity.trim();
    const identity = getAmenityFilterIdentity(label);
    if (label && identity && !options.has(identity)) {
      options.set(identity, { label, count: 0 });
    }
  }

  return [...options.values()]
    .sort(
      (first, second) =>
        second.count - first.count || first.label.localeCompare(second.label, 'pt-BR'),
    )
    .map(({ label }) => label);
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  properties,
  amenityProperties = properties,
  hasMoreSearchResults = false,
  onApplyFilters,
  onResetFilters,
  currency,
}) => {
  const fieldId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });
  const focusRing =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600';
  const [minPrice, setMinPrice] = useState(filters.minPrice);
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(filters.amenities);
  const [minBedrooms, setMinBedrooms] = useState(filters.minBedrooms);
  const [minBeds, setMinBeds] = useState(filters.minBeds ?? 0);
  const [minBaths, setMinBaths] = useState(filters.minBaths);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState(filters.propertyTypes);
  const [superhostOnly, setSuperhostOnly] = useState(filters.superhostOnly);
  const [instantBookOnly, setInstantBookOnly] = useState(filters.instantBookOnly);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const amenitiesKey = filters.amenities.join('\u0000');
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  const draftFilters = useMemo(
    () => ({
      ...filters,
      minPrice,
      maxPrice,
      amenities: selectedAmenities,
      minBedrooms,
      minBeds,
      minBaths,
      propertyTypes: selectedPropertyTypes,
      superhostOnly,
      instantBookOnly,
    }),
    [
      filters,
      instantBookOnly,
      maxPrice,
      minBeds,
      minBaths,
      minBedrooms,
      minPrice,
      selectedAmenities,
      selectedPropertyTypes,
      superhostOnly,
    ],
  );
  const matchingCount = useMemo(
    () => filterPropertiesBySearchFilters(properties, draftFilters).length,
    [draftFilters, properties],
  );
  const availableAmenities = useMemo(
    () => getAvailableAmenities(amenityProperties, selectedAmenities),
    [amenityProperties, selectedAmenities],
  );
  const matchingCountLabel = matchingCount === 1 ? 'acomodação' : 'acomodações';
  const bedroomOptions = [0, 1, 2, 3, 4, 5];
  const bedroomSelection = useSelectedOptionBounds(String(minBedrooms), bedroomOptions.length);

  useEffect(() => {
    const currentFilters = filtersRef.current;
    setMinPrice(currentFilters.minPrice);
    setMaxPrice(currentFilters.maxPrice);
    setSelectedAmenities(currentFilters.amenities);
    setMinBedrooms(currentFilters.minBedrooms);
    setMinBeds(currentFilters.minBeds ?? 0);
    setMinBaths(currentFilters.minBaths);
    setSelectedPropertyTypes(currentFilters.propertyTypes);
    setSuperhostOnly(currentFilters.superhostOnly);
    setInstantBookOnly(currentFilters.instantBookOnly);
  }, [
    filters.minPrice,
    filters.maxPrice,
    amenitiesKey,
    filters.minBedrooms,
    filters.minBeds,
    filters.minBaths,
    filters.propertyTypes,
    filters.superhostOnly,
    filters.instantBookOnly,
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setShowAllAmenities(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleAmenity = (amenity: string) => {
    const identity = getAmenityFilterIdentity(amenity);
    if (
      selectedAmenities.some(
        (selectedAmenity) => getAmenityFilterIdentity(selectedAmenity) === identity,
      )
    ) {
      setSelectedAmenities(
        selectedAmenities.filter(
          (selectedAmenity) => getAmenityFilterIdentity(selectedAmenity) !== identity,
        ),
      );
    } else {
      setSelectedAmenities([...selectedAmenities, amenity]);
    }
  };

  const handleApply = () => {
    onApplyFilters({
      ...filters,
      minPrice,
      maxPrice,
      amenities: selectedAmenities,
      minBedrooms,
      minBeds,
      minBaths,
      propertyTypes: selectedPropertyTypes,
      superhostOnly,
      instantBookOnly,
    });
    onClose();
  };

  const handleClear = () => {
    setMinPrice(0);
    setMaxPrice(5000);
    setSelectedAmenities([]);
    setMinBedrooms(0);
    setMinBeds(0);
    setMinBaths(0);
    setSelectedPropertyTypes([]);
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
        className="w-full max-w-2xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl border border-neutral-200/90 overflow-hidden flex flex-col max-h-[90dvh] animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 bg-white/95 backdrop-blur-md flex items-center justify-between">
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar filtros"
            onClick={onClose}
            className={`h-11 w-11 shrink-0 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer shadow-2xs ${focusRing}`}
          >
            <X className="w-5 h-5" />
          </button>
          <h2 id={`${fieldId}-title`} className="text-base font-extrabold text-neutral-900">
            Filtros
          </h2>
          <div className="h-11 w-11 shrink-0 shrink-0" aria-hidden="true" />
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-8 divide-y divide-neutral-100">
          {/* Price Range */}
          <div>
            <h3 className="text-base font-bold text-neutral-900 mb-1">Faixa de preço</h3>
            <p className="mb-4 text-sm leading-5 text-neutral-600">
              Limites em reais por noite, antes de taxas.
            </p>

            {!filters.checkIn || !filters.checkOut ? (
              <p className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
                Sem datas, os valores são referências e não confirmam disponibilidade. Escolha um
                período para consultar preços reais.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-neutral-300 bg-white px-4 py-3 transition-colors focus-within:border-neutral-900">
                <label
                  htmlFor={`${fieldId}-min-price`}
                  className="mb-1 block text-xs font-semibold text-neutral-600"
                >
                  Preço mínimo por noite
                </label>
                <div className="flex min-h-10 min-w-0 items-center gap-2 font-semibold text-neutral-900">
                  <span className="text-xs text-neutral-500">R$</span>
                  <input
                    id={`${fieldId}-min-price`}
                    type="number"
                    min="0"
                    max={maxPrice}
                    value={minPrice}
                    onChange={(e) =>
                      setMinPrice(Math.min(maxPrice, 5000, Math.max(0, Number(e.target.value))))
                    }
                    className="min-h-10 w-full min-w-0 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                  />
                </div>
              </div>

              <div className="min-w-0 rounded-2xl border border-neutral-300 bg-white px-4 py-3 transition-colors focus-within:border-neutral-900">
                <label
                  htmlFor={`${fieldId}-max-price`}
                  className="mb-1 block text-xs font-semibold text-neutral-600"
                >
                  Preço máximo por noite
                </label>
                <div className="flex min-h-10 min-w-0 items-center gap-2 font-semibold text-neutral-900">
                  <span className="text-xs text-neutral-500">R$</span>
                  <input
                    id={`${fieldId}-max-price`}
                    type="number"
                    min={minPrice}
                    max="5000"
                    value={maxPrice}
                    onChange={(e) =>
                      setMaxPrice(Math.min(5000, Math.max(minPrice, Number(e.target.value))))
                    }
                    className="min-h-10 w-full min-w-0 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
              <span>{formatCurrency(minPrice, currency)} / noite</span>
              <span>{formatCurrency(maxPrice, currency)} / noite</span>
            </div>
          </div>

          {/* Rooms and Beds */}
          <div className="pt-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Quartos e camas</h3>

            <div>
              <p
                id={`${fieldId}-bedrooms-label`}
                className="text-xs font-semibold text-neutral-700 mb-2"
              >
                Quartos mínimos
              </p>
              <div
                ref={bedroomSelection.groupRef}
                role="group"
                aria-labelledby={`${fieldId}-bedrooms-label`}
                className="relative grid grid-cols-2 gap-2 py-1 min-[480px]:grid-cols-3 sm:grid-cols-6"
              >
                <span
                  aria-hidden="true"
                  className={`filter-shared-selection ${bedroomSelection.bounds.ready ? 'filter-shared-selection--ready' : ''}`}
                  style={{
                    width: bedroomSelection.bounds.width,
                    height: bedroomSelection.bounds.height,
                    transform: `translate3d(${bedroomSelection.bounds.left}px, ${bedroomSelection.bounds.top}px, 0)`,
                  }}
                />
                {bedroomOptions.map((num) => (
                  <button
                    key={num}
                    data-shared-option={num}
                    type="button"
                    aria-pressed={minBedrooms === num}
                    onClick={() => setMinBedrooms(num)}
                    className={`relative z-10 min-h-11 min-w-0 whitespace-normal break-words rounded-full border px-1 leading-tight text-xs font-semibold transition-colors cursor-pointer ${focusRing} ${
                      minBedrooms === num
                        ? 'border-transparent text-white'
                        : 'border-neutral-200 text-neutral-700 hover:border-neutral-900'
                    }`}
                  >
                    {num === 0 ? 'Qualquer' : `${num}+`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p
                id={`${fieldId}-beds-label`}
                className="text-xs font-semibold text-neutral-700 mb-2"
              >
                Camas mínimas
              </p>
              <div
                role="group"
                aria-labelledby={`${fieldId}-beds-label`}
                className="grid grid-cols-2 gap-2 py-1 min-[480px]:grid-cols-3 sm:grid-cols-6"
              >
                {[0, 1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    aria-pressed={minBeds === num}
                    onClick={() => setMinBeds(num)}
                    className={`min-h-11 min-w-0 whitespace-normal break-words px-1 leading-tight rounded-full text-xs font-semibold border transition-all cursor-pointer ${focusRing} ${
                      minBeds === num
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
              <p
                id={`${fieldId}-baths-label`}
                className="text-xs font-semibold text-neutral-700 mb-2"
              >
                Banheiros mínimos
              </p>
              <div
                role="group"
                aria-labelledby={`${fieldId}-baths-label`}
                className="grid grid-cols-2 gap-2 py-1 min-[480px]:grid-cols-3 sm:grid-cols-5"
              >
                {[0, 1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    aria-pressed={minBaths === num}
                    onClick={() => setMinBaths(num)}
                    className={`min-h-11 min-w-0 whitespace-normal break-words px-1 leading-tight rounded-full text-xs font-semibold border transition-all cursor-pointer ${focusRing} ${
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

          <div className="pt-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Tipo de acomodação</h3>
            <div
              role="group"
              aria-label="Tipo de acomodação"
              className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3"
            >
              {[
                { value: 'entire_place', label: 'Espaço inteiro' },
                { value: 'private_room', label: 'Quarto privativo' },
                { value: 'shared_room', label: 'Quarto compartilhado' },
              ].map(({ value, label }) => {
                const isSelected = selectedPropertyTypes.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedPropertyTypes((current) =>
                        isSelected ? current.filter((item) => item !== value) : [...current, value],
                      )
                    }
                    className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${focusRing} ${isSelected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:border-neutral-900'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <h3 className="text-base font-bold text-neutral-900">Opções de reserva</h3>
            <div className="space-y-2">
              {[
                {
                  label: 'Apenas Superhost',
                  description: 'Anfitriões com avaliações consistentes.',
                  selected: superhostOnly,
                  onToggle: () => setSuperhostOnly((value) => !value),
                },
                {
                  label: 'Reserva instantânea',
                  description: 'Reserve sem aguardar aprovação do anfitrião.',
                  selected: instantBookOnly,
                  onToggle: () => setInstantBookOnly((value) => !value),
                },
              ].map((option) => (
                <div
                  key={option.label}
                  data-filter-switch-row
                  className="flex min-w-0 flex-col gap-3 rounded-2xl border border-neutral-200 p-3 min-[400px]:flex-row min-[400px]:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-neutral-900">
                      {option.label}
                    </p>
                    <p className="break-words text-xs text-neutral-500">{option.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={option.label}
                    aria-checked={option.selected}
                    onClick={option.onToggle}
                    className={`h-11 w-11 self-end rounded-full border ${focusRing} min-[400px]:self-auto ${option.selected ? 'bg-neutral-900 text-white' : 'bg-white'}`}
                  >
                    ✓
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div className="pt-6">
            <h3 className="text-base font-bold text-neutral-900 mb-3">Comodidades populares</h3>
            {availableAmenities.length === 0 ? (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-5 text-neutral-600">
                A Stays não retornou comodidades para as hospedagens disponíveis. O filtro ficará
                disponível quando esses dados forem sincronizados.
              </p>
            ) : null}
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(showAllAmenities ? availableAmenities : availableAmenities.slice(0, 6)).map(
                (amenity) => {
                  const amenityIdentity = getAmenityFilterIdentity(amenity);
                  const isSelected = selectedAmenities.some(
                    (selectedAmenity) =>
                      getAmenityFilterIdentity(selectedAmenity) === amenityIdentity,
                  );
                  return (
                    <button
                      key={amenity}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleAmenity(amenity)}
                      className={`flex min-h-11 min-w-0 items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer ${focusRing} ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-sm flex items-center justify-center border ${
                          isSelected
                            ? 'border-white bg-white text-neutral-900'
                            : 'border-neutral-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="min-w-0 flex-1 whitespace-normal break-words">
                        {amenity}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
            {availableAmenities.length > 10 && (
              <button
                type="button"
                aria-expanded={showAllAmenities}
                onClick={() => setShowAllAmenities((isShowingAll) => !isShowingAll)}
                className={`mt-4 min-h-11 rounded-lg px-3 text-sm font-semibold text-neutral-800 underline underline-offset-4 hover:text-neutral-600 ${focusRing}`}
              >
                {showAllAmenities ? 'Mostrar menos' : 'Mostrar todas as comodidades'}
              </button>
            )}
          </div>
        </div>

        {hasMoreSearchResults && (
          <p role="note" className="px-4 py-2 text-xs text-neutral-600 sm:px-6">
            {matchingCount} {matchingCountLabel} entre as opções carregadas. Há outras páginas a
            verificar após aplicar os filtros.
          </p>
        )}
        {/* Modal Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:px-6 min-[480px]:py-2 sm:py-4">
          <button
            type="button"
            onClick={handleClear}
            className={`min-h-11 self-center px-3 text-xs font-semibold text-neutral-700 underline hover:text-neutral-900 cursor-pointer min-[480px]:px-0 ${focusRing}`}
          >
            Limpar tudo
          </button>

          <button
            type="button"
            onClick={handleApply}
            className={`min-h-11 w-full rounded-full bg-neutral-900 px-4 py-3 text-xs font-bold text-white shadow-md transition-all hover:bg-black hover:scale-105 active:scale-95 min-[480px]:w-auto min-[480px]:px-4 sm:px-6 cursor-pointer ${focusRing}`}
          >
            {hasMoreSearchResults
              ? 'Aplicar filtros'
              : `Mostrar ${matchingCount} ${matchingCountLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
};
