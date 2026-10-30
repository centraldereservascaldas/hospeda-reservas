import { useEffect, useState } from 'react';
import { Globe, ShieldCheck } from 'lucide-react';
import type { Currency } from '../types';
import { readLegalPageSummaries, type LegalPageSummary } from '../utils/legalPages';
import { LogoCRCN } from './LogoCRCN';
import { OPEN_MEASUREMENT_PREFERENCES } from './MeasurementPreferences';

interface AppFooterProps {
  currency: Currency;
  onCreateListing: () => void;
}

export function AppFooter({ currency, onCreateListing }: AppFooterProps) {
  const [legalPages, setLegalPages] = useState<LegalPageSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/public/legal-pages', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => setLegalPages(readLegalPageSummaries(payload)))
      .catch(() => {
        if (!controller.signal.aborted) setLegalPages([]);
      });

    return () => controller.abort();
  }, []);

  return (
    <footer className="border-t border-white/60 bg-white/40 backdrop-blur-2xl text-xs text-neutral-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-[calc(6rem_+_env(safe-area-inset-bottom,0px))] sm:pb-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <LogoCRCN size="md" variant="glass" />
            <p className="text-caption text-neutral-500 leading-relaxed">
              Encontre hospedagens em Caldas Novas e região, com opções próximas a parques e
              atrações.
            </p>
            <div className="pt-1 text-caption text-neutral-700 font-semibold space-y-1">
              <p>📍 Caldas Novas - Goiás, Brasil</p>
              <p>
                <span aria-hidden="true">✉️ </span>
                <a
                  href="mailto:centraldereservascn@gmail.com"
                  aria-label="Enviar e-mail para a CRCN"
                  className="underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  centraldereservascn@gmail.com
                </a>
              </p>
              <p>CENTRAL DE RESERVAS CALDAS NOVAS CRCN LTDA</p>
              <p>CNPJ 67.314.679/0001-64</p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-neutral-900 mb-3">Destinos e guias</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="/blog/"
                  className="inline-flex min-h-11 items-center underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-700"
                >
                  Blog: ideias para a sua viagem
                </a>
              </li>
              <li>
                <a
                  href="/destinos/caldas-novas"
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-700"
                >
                  Hospedagem em Caldas Novas
                </a>
              </li>
              <li>
                <a
                  href="/destinos/rio-quente"
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-700"
                >
                  Planeje sua viagem a Rio Quente
                </a>
              </li>
              <li>
                <a
                  href="/guias/como-escolher-hospedagem"
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-700"
                >
                  O que conferir antes de reservar
                </a>
              </li>
              <li>diRoma Acqua Park</li>
              <li>Hot Park &amp; Praia do Cerrado</li>
              <li>L’acqua diRoma 24h</li>
              <li>Náutico Praia Clube (Lago Corumbá)</li>
              <li>Prive Diversão &amp; Water Park</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-neutral-900 mb-3">Para proprietários</h4>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={onCreateListing}
                  className="inline-flex min-h-11 items-center text-sm text-left cursor-pointer hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  Anuncie seu imóvel
                </button>
              </li>
              <li>Gestão de Flats em Caldas Novas</li>
              <li>Vantagens para Proprietários</li>
              <li>Regras de Condomínio e Pulseiras</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-neutral-900 mb-3">Atendimento</h4>
            <div className="p-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-orange-600 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Suporte para sua reserva</span>
              </div>
              <p className="text-caption text-neutral-500 leading-relaxed">
                Ajudamos você a acompanhar a confirmação e as orientações de chegada.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-500 text-caption">
          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
            <span className="min-w-0 max-w-full">
              © {new Date().getFullYear()} Central de Reservas Caldas Novas. Todos os direitos
              reservados.
            </span>
            {legalPages.map((page) => (
              <span key={page.slug} className="contents">
                <span aria-hidden="true">•</span>
                <a
                  href={page.path}
                  className="min-h-11 inline-flex items-center underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  {page.title}
                </a>
              </span>
            ))}
            <span>•</span>
            <button
              type="button"
              data-measurement-preferences-trigger
              onClick={() => window.dispatchEvent(new Event(OPEN_MEASUREMENT_PREFERENCES))}
              className="min-h-11 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Preferências de medição
            </button>
          </div>

          <div className="flex items-center gap-4 font-semibold text-neutral-700">
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-orange-500" />
              Português (BR)
            </span>
            <span>{currency}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
