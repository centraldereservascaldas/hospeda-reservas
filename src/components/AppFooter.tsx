import { Globe, ShieldCheck } from 'lucide-react';
import type { Currency } from '../types';
import { LogoCRCN } from './LogoCRCN';

interface AppFooterProps {
  currency: Currency;
  onCreateListing: () => void;
}

export function AppFooter({ currency, onCreateListing }: AppFooterProps) {
  return (
    <footer className="border-t border-white/60 bg-white/40 backdrop-blur-2xl text-xs text-neutral-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <LogoCRCN size="md" variant="glass" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Encontre hospedagens em Caldas Novas e região, com opções próximas a parques e atrações.
            </p>
            <div className="pt-1 text-[11px] text-neutral-700 font-semibold space-y-1">
              <p>📍 Caldas Novas - Goiás, Brasil</p>
              <p>✉️ centraldereservascn@gmail.com</p>
              <p>CENTRAL DE RESERVAS CALDAS NOVAS CRCN LTDA</p>
              <p>CNPJ 67.314.679/0001-64</p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-neutral-900 mb-3">Destinos e parques</h4>
            <ul className="space-y-2">
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
                  className="hover:underline text-left cursor-pointer"
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
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Ajudamos você a acompanhar a confirmação e as orientações de chegada.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-neutral-500 text-[11px]">
          <div className="flex items-center gap-2">
            <span>
              © {new Date().getFullYear()} Central de Reservas Caldas Novas. Todos os direitos
              reservados.
            </span>
            <span>•</span>
            <span>Privacidade</span>
            <span>•</span>
            <span>Termos</span>
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
