import { Minus, Plus, Ticket, Waves, CalendarDays } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

// Visual fixtures only. Replace with validated supplier offers before enabling sales.
export const previewParkOffers = [
  {
    id: 'hot-park',
    name: 'Hot Park',
    location: 'Rio Quente',
    color: 'from-cyan-800 to-teal-500',
    categories: [
      { id: 'adult', label: 'Adulto', priceCents: 12000 },
      { id: 'child', label: 'Infantil', priceCents: 8000 },
    ],
  },
  {
    id: 'diroma',
    name: 'diRoma Acqua Park',
    location: 'Caldas Novas',
    color: 'from-blue-900 to-sky-500',
    categories: [
      { id: 'adult', label: 'Adulto', priceCents: 9000 },
      { id: 'child', label: 'Infantil', priceCents: 6000 },
    ],
  },
  {
    id: 'lagoa',
    name: 'Lagoa Termas Parque',
    location: 'Caldas Novas',
    color: 'from-emerald-900 to-lime-600',
    categories: [
      { id: 'adult', label: 'Adulto', priceCents: 7000 },
      { id: 'child', label: 'Infantil', priceCents: 4500 },
    ],
  },
] as const;

export type ParkTicketCart = Record<string, { date: string; quantities: Record<string, number> }>;
export function getPreviewTicketLines(cart: ParkTicketCart) {
  return previewParkOffers.flatMap((park) =>
    park.categories.flatMap((category) => {
      const quantity = cart[park.id]?.quantities[category.id] ?? 0;
      return quantity > 0
        ? [
            {
              parkId: park.id,
              parkName: park.name,
              category: category.label,
              quantity,
              date: cart[park.id].date,
              totalCents: quantity * category.priceCents,
            },
          ]
        : [];
    }),
  );
}

interface ParkTicketSelectorProps {
  from: string;
  to: string;
  value: ParkTicketCart;
  onChange: (value: ParkTicketCart) => void;
  disabled?: boolean;
}

export function ParkTicketSelector({
  from,
  to,
  value,
  onChange,
  disabled,
}: ParkTicketSelectorProps) {
  const lines = getPreviewTicketLines(value);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const visitDates: string[] = [];
  for (
    let day = Date.parse(from);
    day <= Date.parse(to) && visitDates.length < 366;
    day += 86400000
  ) {
    visitDates.push(new Date(day).toISOString().slice(0, 10));
  }
  return (
    <section className="mb-7 border-b border-neutral-200 pb-7" aria-labelledby="park-tickets-title">
      <div className="flex items-center gap-2">
        <Ticket size={22} className="text-orange-700" aria-hidden="true" />
        <h2 id="park-tickets-title" className="text-xl font-bold">
          Complete a viagem
        </h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        Escolha seus passeios e monte uma viagem ainda melhor.
      </p>
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        Prévia interativa · Todos os preços, categorias e datas são demonstrativos. Nenhum ingresso
        será vendido ou emitido nesta versão.
      </p>
      <div className="mt-4 space-y-3">
        {previewParkOffers.map((park) => {
          const selected = value[park.id];
          const count = Object.values(selected?.quantities ?? {}).reduce(
            (sum, quantity) => sum + quantity,
            0,
          );
          return (
            <details
              key={park.id}
              className={`group overflow-hidden rounded-2xl border ${count ? 'border-orange-600' : 'border-neutral-200'}`}
            >
              <summary className="flex min-h-24 cursor-pointer list-none items-center gap-4 p-3 focus-visible:outline-2 focus-visible:outline-orange-700 [&::-webkit-details-marker]:hidden">
                <span
                  className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${park.color}`}
                  aria-hidden="true"
                >
                  <Waves size={40} className="text-white/90" />
                  <span className="absolute bottom-1 text-[9px] font-bold uppercase tracking-widest text-white/80">
                    Ilustração
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-500">{park.location}</span>
                  <span className="mt-0.5 block font-semibold">{park.name}</span>
                  <span className="mt-1 block text-xs text-neutral-600">
                    Exemplo a partir de{' '}
                    <strong>
                      {formatCurrency(
                        Math.min(...park.categories.map((category) => category.priceCents)) / 100,
                        'BRL',
                      )}
                    </strong>
                  </span>
                </span>
                <span
                  className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm ${count ? 'bg-orange-800 font-bold text-white' : 'bg-neutral-100 text-neutral-700'}`}
                  aria-label={count ? `${count} ingressos selecionados` : 'Ver opções'}
                >
                  {count || <Plus size={16} aria-hidden="true" />}
                </span>
              </summary>
              <fieldset
                disabled={disabled}
                className="min-w-0 space-y-4 border-t border-neutral-200 p-4"
              >
                <legend className="sr-only">Ingressos {park.name}</legend>
                <label className="block text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <CalendarDays size={16} aria-hidden="true" />
                    Data da visita · {park.name}
                  </span>
                  <select
                    value={selected?.date ?? from}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [park.id]: {
                          date: event.target.value,
                          quantities: selected?.quantities ?? {},
                        },
                      })
                    }
                    className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-orange-700"
                  >
                    {visitDates.map((date) => (
                      <option key={date} value={date}>
                        {new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'long',
                          timeZone: 'UTC',
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                {park.categories.map((category) => {
                  const quantity = selected?.quantities[category.id] ?? 0;
                  const update = (next: number) =>
                    onChange({
                      ...value,
                      [park.id]: {
                        date: selected?.date || from,
                        quantities: {
                          ...selected?.quantities,
                          [category.id]: Math.min(20, Math.max(0, next)),
                        },
                      },
                    });
                  return (
                    <div
                      key={category.id}
                      className="flex flex-wrap items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{category.label}</p>
                        <p className="mt-0.5 text-neutral-500">
                          {formatCurrency(category.priceCents / 100, 'BRL')} por pessoa · exemplo
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={quantity === 0}
                          onClick={() => update(quantity - 1)}
                          aria-label={`Remover ${category.label.toLowerCase()} — ${park.name}`}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:opacity-30"
                        >
                          <Minus size={16} aria-hidden="true" />
                        </button>
                        <output
                          className="w-5 text-center font-semibold"
                          aria-label={`${category.label} — ${park.name}`}
                        >
                          {quantity}
                        </output>
                        <button
                          type="button"
                          disabled={quantity >= 20}
                          onClick={() => update(quantity + 1)}
                          aria-label={`Adicionar ${category.label.toLowerCase()} — ${park.name}`}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:opacity-30"
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="border-t border-neutral-100 pt-3 text-xs leading-5 text-neutral-500">
                  Faixas etárias, disponibilidade, cancelamento e entrega do voucher serão
                  informados após a integração do fornecedor.
                </p>
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...value };
                      delete next[park.id];
                      onChange(next);
                    }}
                    className="min-h-11 text-sm font-semibold underline underline-offset-4"
                  >
                    Remover ingressos deste parque
                  </button>
                )}
              </fieldset>
            </details>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium">
        {totalQuantity
          ? `${totalQuantity} ingresso(s) na simulação · ${formatCurrency(totalCents / 100, 'BRL')}`
          : 'Opcional: você pode continuar somente com a hospedagem.'}
      </p>
    </section>
  );
}
