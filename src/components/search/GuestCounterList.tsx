import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface GuestCounts {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

interface GuestCounterListProps {
  counts: GuestCounts;
  onChange: (counts: GuestCounts) => void;
  compact?: boolean;
}

const MAX_OCCUPANCY = 17;

export function GuestCounterList({ counts, onChange, compact = false }: GuestCounterListProps) {
  const infoId = useId();
  const [isServiceAnimalInfoOpen, setIsServiceAnimalInfoOpen] = useState(false);
  const occupancy = counts.adults + counts.children + counts.infants;
  const categories = [
    { key: 'adults', label: 'Adultos', description: '13 anos ou mais', minimum: 1 },
    { key: 'children', label: 'Crianças', description: 'De 2 a 12 anos', minimum: 0 },
    { key: 'infants', label: 'Bebês', description: 'Menores de 2 anos', minimum: 0 },
    {
      key: 'pets',
      label: 'Animais de estimação',
      description: 'Pets que viajam com você',
      minimum: 0,
    },
  ] as const;

  return (
    <div
      className={
        compact ? 'w-full divide-y divide-neutral-200' : 'space-y-5 divide-y divide-neutral-100'
      }
    >
      {categories.map((category) => {
        const count = counts[category.key];
        const canIncrease = category.key === 'pets' || occupancy < MAX_OCCUPANCY;
        return (
          <div
            key={category.key}
            className={
              compact
                ? 'flex min-h-[4.5rem] items-center justify-between gap-3 py-2 first:pt-0 last:pb-0'
                : 'flex items-center justify-between gap-4 pt-4 first:pt-2'
            }
          >
            <div className="min-w-0">
              <p
                className={
                  compact
                    ? 'text-sm font-semibold text-neutral-900'
                    : 'text-base font-bold text-neutral-900'
                }
              >
                {category.label}
              </p>
              <p className="text-sm text-neutral-500">{category.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                aria-label={`Diminuir ${category.label.toLocaleLowerCase('pt-BR')}`}
                disabled={count <= category.minimum}
                onClick={() =>
                  onChange({ ...counts, [category.key]: Math.max(category.minimum, count - 1) })
                }
                className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span
                aria-live="polite"
                className="w-8 text-center text-base font-semibold text-neutral-900"
              >
                {count}
              </span>
              <button
                type="button"
                aria-label={`Aumentar ${category.label.toLocaleLowerCase('pt-BR')}`}
                disabled={!canIncrease}
                onClick={() => onChange({ ...counts, [category.key]: count + 1 })}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}

      <div className="pt-3">
        <button
          type="button"
          aria-expanded={isServiceAnimalInfoOpen}
          aria-controls={infoId}
          onClick={() => setIsServiceAnimalInfoOpen((open) => !open)}
          className="min-h-11 text-left text-sm font-medium text-neutral-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
        >
          Vai levar um animal de serviço?
        </button>
        {isServiceAnimalInfoOpen && (
          <p id={infoId} className="mt-2 max-w-sm text-xs leading-relaxed text-neutral-600">
            Animais de serviço são tratados separadamente dos pets. Confirme as condições
            diretamente com a hospedagem.
          </p>
        )}
      </div>
    </div>
  );
}
