import { useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { apiFetch } from '../../services/apiFetch';
import type { CheckoutAccessCredentials } from '../../services/checkoutApi';

type Person = { name: string; document: string };
const inputClass =
  'mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-orange-600 focus:ring-4 focus:ring-orange-600/10';
const labelClass = 'block text-sm font-semibold text-neutral-800';

export function GuestDetailsForm({
  reference,
  credentials,
}: {
  reference: string;
  credentials: CheckoutAccessCredentials;
}) {
  const [holder, setHolder] = useState({ name: '', document: '', phone: '' });
  const [companions, setCompanions] = useState<Person[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    try {
      const authenticated = credentials.type === 'authenticated';
      const endpoint = authenticated
        ? `/api/my-direct-booking-orders/${encodeURIComponent(reference)}/checkout/guests`
        : `/api/checkout/${encodeURIComponent(reference)}/guests`;
      const response = await apiFetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(credentials.type === 'authenticated'
            ? { Authorization: `Bearer ${credentials.accessToken}` }
            : { 'X-Checkout-Resume-Token': credentials.resumeToken }),
        },
        body: JSON.stringify({ holder, companions }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('success' in result) ||
        result.success !== true
      ) {
        const reason =
          result &&
          typeof result === 'object' &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'Não foi possível confirmar o envio. Tente novamente.';
        setMessage(reason);
        setState('error');
        return;
      }
      setMessage('Dados registrados na reserva.');
      setState('sent');
    } catch {
      setMessage('Não foi possível confirmar o envio. Tente novamente.');
      setState('error');
    }
  }

  return (
    <section
      aria-labelledby="guest-details-title"
      className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_20px_65px_-40px_rgba(37,30,18,0.45)]"
    >
      <div className="border-b border-neutral-100 bg-gradient-to-br from-orange-50 via-white to-white px-6 py-7 sm:px-8">
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <UsersRound size={21} aria-hidden="true" />
        </span>
        <h2 id="guest-details-title" className="text-2xl font-black tracking-tight">
          Preencha os dados dos hóspedes
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Informe o titular e os acompanhantes para preparar o check-in desta reserva.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-6 px-6 py-7 sm:px-8">
        <fieldset disabled={state === 'sending'} className="space-y-4">
          <legend className="mb-3 font-bold">Titular da hospedagem</legend>
          <label className={labelClass}>
            Nome completo
            <input
              className={inputClass}
              required
              maxLength={180}
              autoComplete="name"
              value={holder.name}
              onChange={(event) => setHolder({ ...holder, name: event.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              CPF ou documento
              <input
                className={inputClass}
                required
                maxLength={30}
                value={holder.document}
                onChange={(event) => setHolder({ ...holder, document: event.target.value })}
              />
            </label>
            <label className={labelClass}>
              Telefone
              <input
                className={inputClass}
                type="tel"
                required
                maxLength={30}
                autoComplete="tel"
                value={holder.phone}
                onChange={(event) => setHolder({ ...holder, phone: event.target.value })}
              />
            </label>
          </div>
          <div className="border-t border-neutral-100 pt-5">
            <h3 className="font-bold">Acompanhantes</h3>
            <p className="mt-1 text-sm text-neutral-500">Adicione quem vai com você.</p>
          </div>
          {companions.map((person, index) => (
            <fieldset
              key={index}
              className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <legend className="sr-only">Acompanhante {index + 1}</legend>
              <div className="flex justify-between">
                <strong>Acompanhante {index + 1}</strong>
                <button
                  type="button"
                  aria-label={`Remover acompanhante ${index + 1}`}
                  onClick={() => setCompanions((items) => items.filter((_, i) => i !== index))}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <label className={labelClass}>
                Nome completo
                <input
                  className={inputClass}
                  required
                  maxLength={180}
                  value={person.name}
                  onChange={(event) =>
                    setCompanions((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label className={labelClass}>
                Documento
                <input
                  className={inputClass}
                  required
                  maxLength={30}
                  value={person.document}
                  onChange={(event) =>
                    setCompanions((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, document: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => setCompanions((items) => [...items, { name: '', document: '' }])}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-200 px-4 text-sm font-bold text-orange-800"
          >
            <Plus size={17} />
            Adicionar acompanhante
          </button>
        </fieldset>
        <button
          type="submit"
          disabled={state === 'sending'}
          className="min-h-12 w-full rounded-xl bg-orange-600 px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {state === 'sending' ? 'Enviando…' : 'Enviar dados dos hóspedes'}
        </button>
        {message && (
          <p role={state === 'error' ? 'alert' : 'status'} className="text-sm text-neutral-700">
            {message}
          </p>
        )}
        <p className="flex items-start gap-2 text-xs leading-5 text-neutral-500">
          <ShieldCheck size={15} className="shrink-0 text-orange-700" />
          Os dados serão registrados nas observações da sua reserva.
        </p>
      </form>
    </section>
  );
}
