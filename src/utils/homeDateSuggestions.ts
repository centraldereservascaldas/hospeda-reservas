import { getSurpriseDateCandidates } from './surpriseDates';

export interface HomeDateSuggestion {
  checkIn: string;
  checkOut: string;
  label: string;
  eyebrow: string;
  kind: 'weekend' | 'event' | 'holiday' | 'high-season';
}

export interface HomeDiscoveryCollection {
  id: 'pets' | 'caldas-country' | 'holidays';
  eyebrow: string;
  title: string;
  description: string;
  suggestions: Array<HomeDateSuggestion & { id: string; propertyIndex?: number }>;
  includePet?: boolean;
}

const dateAtNoon = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const nextFriday = (date: Date) => {
  const daysUntilFriday = (5 - date.getDay() + 7) % 7;
  return addDays(date, daysUntilFriday);
};

export function getHomeDateSuggestions(
  now = new Date(),
  random: () => number = Math.random,
): HomeDateSuggestion[] {
  const earliest = addDays(dateAtNoon(now), 2);
  const firstFriday = nextFriday(earliest);
  const weekendPool = Array.from({ length: 8 }, (_, index) => addDays(firstFriday, index * 7));
  const firstWeekendIndex = Math.min(
    weekendPool.length - 1,
    Math.floor(random() * weekendPool.length),
  );
  let secondWeekendIndex = Math.min(
    weekendPool.length - 1,
    Math.floor(random() * weekendPool.length),
  );
  if (secondWeekendIndex === firstWeekendIndex) {
    secondWeekendIndex = (secondWeekendIndex + 3) % weekendPool.length;
  }

  const weekends = [weekendPool[firstWeekendIndex], weekendPool[secondWeekendIndex]]
    .sort((first, second) => first.getTime() - second.getTime())
    .map((checkIn, index): HomeDateSuggestion => ({
      checkIn: toIsoDate(checkIn),
      checkOut: toIsoDate(addDays(checkIn, 2)),
      label: index === 0 ? 'Fim de semana em Caldas' : 'Outro fim de semana',
      eyebrow: 'SEXTA A DOMINGO',
      kind: 'weekend',
    }));

  const seasonal = getSurpriseDateCandidates(now, random)
    .filter(
      (candidate, index, all) =>
        all.findIndex((item) => item.kind === candidate.kind) === index &&
        !weekends.some(
          (weekend) =>
            weekend.checkIn === candidate.checkIn && weekend.checkOut === candidate.checkOut,
        ),
    )
    .slice(0, 3)
    .map((candidate): HomeDateSuggestion => ({
      checkIn: candidate.checkIn,
      checkOut: candidate.checkOut,
      label: candidate.occasion,
      eyebrow:
        candidate.kind === 'event'
          ? 'EVENTO EM CALDAS'
          : candidate.kind === 'high-season'
            ? 'ALTA TEMPORADA'
            : 'FERIADO PROLONGADO',
      kind: candidate.kind,
    }));

  const unique = new Map<string, HomeDateSuggestion>();
  for (const suggestion of [...weekends, ...seasonal]) {
    unique.set(`${suggestion.checkIn}|${suggestion.checkOut}`, suggestion);
  }

  return [...unique.values()].slice(0, 5);
}

export function getHomeDiscoveryCollections(
  now = new Date(),
  random: () => number = Math.random,
): HomeDiscoveryCollection[] {
  const earliest = addDays(dateAtNoon(now), 2);
  const firstFriday = nextFriday(earliest);
  const petWeekends = Array.from({ length: 5 }, (_, index) => {
    const checkIn = addDays(firstFriday, index * 7);
    return {
      id: `pet-weekend-${index + 1}`,
      checkIn: toIsoDate(checkIn),
      checkOut: toIsoDate(addDays(checkIn, 2)),
      label: 'Fim de semana com seu pet',
      eyebrow: 'CONSULTE PETS',
      kind: 'weekend' as const,
      propertyIndex: index,
    };
  });

  const seasonal = getSurpriseDateCandidates(now, random);
  const event = seasonal.find((candidate) => candidate.kind === 'event');
  const eventSuggestions = event
    ? Array.from({ length: 5 }, (_, index) => ({
        id: `caldas-country-${index + 1}`,
        checkIn: event.checkIn,
        checkOut: event.checkOut,
        label: event.occasion,
        eyebrow: 'CALDAS COUNTRY',
        kind: 'event' as const,
        propertyIndex: index,
      }))
    : [];

  const holidaySuggestions = seasonal
    .filter((candidate) => candidate.kind === 'holiday' || candidate.kind === 'high-season')
    .filter(
      (candidate, index, all) =>
        all.findIndex((item) => item.checkIn === candidate.checkIn) === index,
    )
    .slice(0, 5)
    .map((candidate, index) => ({
      id: `holiday-${index + 1}`,
      checkIn: candidate.checkIn,
      checkOut: candidate.checkOut,
      label: candidate.occasion,
      eyebrow: candidate.kind === 'high-season' ? 'ALTA TEMPORADA' : 'FERIADO',
      kind: candidate.kind,
      propertyIndex: index,
    }));

  return [
    {
      id: 'pets',
      eyebrow: 'VIAJE COM TODA A FAMÍLIA',
      title: 'Hospedagens para viajar com seu pet',
      description:
        'Escolha o fim de semana e consulte a aceitação do pet antes de concluir a reserva.',
      suggestions: petWeekends,
      includePet: true,
    },
    ...(eventSuggestions.length
      ? [
          {
            id: 'caldas-country' as const,
            eyebrow: 'EVENTO EM CALDAS NOVAS',
            title: 'Caldas Country Festival',
            description:
              'Opções para 20 a 23 de novembro, com diferentes imóveis e valores para o evento.',
            suggestions: eventSuggestions,
          },
        ]
      : []),
    {
      id: 'holidays',
      eyebrow: 'PLANEJE COM ANTECEDÊNCIA',
      title: 'Datas comemorativas e feriados',
      description: 'Natal, Réveillon, Carnaval e feriados prolongados para você comparar.',
      suggestions: holidaySuggestions,
    },
  ];
}
