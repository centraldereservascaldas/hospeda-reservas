import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { CieloSopCardForm } from './CieloSopCardForm';

export function CieloCheckoutPreviewPage() {
  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-neutral-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="liquid-glass flex items-center justify-between rounded-2xl px-4 py-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-neutral-800 transition hover:text-orange-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao site
          </a>
          <span className="liquid-glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-neutral-700">
            <ShieldCheck className="h-4 w-4 text-orange-700" aria-hidden="true" /> Checkout Cielo
          </span>
        </header>

        <section className="liquid-glass-card grid gap-6 rounded-3xl p-5 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.24)] sm:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-800">
                Reserva demonstrativa
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Resumo da sua estadia</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Apartamento demonstrativo · Caldas Novas
              </p>
            </div>

            <div className="grid gap-4 rounded-2xl border border-white/80 bg-white/35 p-4 text-sm shadow-inner backdrop-blur-xl sm:grid-cols-2">
              <div>
                <p className="font-bold">Check-in</p>
                <p className="mt-1 text-neutral-600">12 nov 2026</p>
              </div>
              <div>
                <p className="font-bold">Check-out</p>
                <p className="mt-1 text-neutral-600">14 nov 2026 · 2 noites</p>
              </div>
            </div>

            <CieloSopCardForm
              reference="previewcielopreviewcielopreviewcielopreviewcielo"
              amount="576.00"
              credentials={null}
              onAttemptFinished={() => undefined}
              previewOnly
            />
          </div>

          <aside
            className="liquid-glass-card h-fit space-y-4 rounded-2xl p-5"
            aria-label="Resumo do valor demonstrativo"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Resumo do pedido
              </p>
              <h2 className="mt-1 font-extrabold">Apartamento demonstrativo</h2>
            </div>
            <div className="space-y-3 border-y border-white/70 py-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-600">Estadia · 2 noites</span>
                <span>R$ 486,00</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-600">Taxa de limpeza</span>
                <span>R$ 90,00</span>
              </div>
            </div>
            <div className="flex justify-between gap-4 font-extrabold">
              <span>Total demonstrativo</span>
              <span className="text-orange-800">R$ 576,00</span>
            </div>
            <p className="text-xs leading-5 text-neutral-500">
              Valores fictícios apenas para visualizar o layout. Nenhuma reserva ou cobrança será
              criada.
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
