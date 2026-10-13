import { Sparkles } from 'lucide-react';
import { LogoCRCN } from './LogoCRCN';

interface SofiaAssistantTriggerProps {
  onOpen: () => void;
}

export function SofiaAssistantTrigger({ onOpen }: SofiaAssistantTriggerProps) {
  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40">
      <button
        type="button"
        onClick={onOpen}
        className="group flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-br from-orange-500/75 via-amber-400/70 to-orange-500/75 backdrop-blur-2xl text-white font-black text-xs shadow-[0_8px_26px_rgba(234,88,12,0.24),inset_0_1.5px_2px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(255,255,255,0.25)] border border-white/85 ring-1 ring-white/30 hover:from-orange-500/85 hover:via-amber-400/80 hover:to-orange-500/85 hover:scale-105 active:scale-95 transition-all cursor-pointer"
        aria-label="Falar com Sofia, concierge virtual"
      >
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center">
          <LogoCRCN
            size="sm"
            showText={false}
            className="absolute left-1/2 top-1/2 !gap-0 -translate-x-1/2 -translate-y-1/2 scale-[0.68]"
          />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />
        </div>
        <div className="flex flex-col text-left">
          <span className="leading-tight flex items-center gap-1 font-black">
            Sofia • Concierge IA
            <Sparkles
              className="w-3 h-3 text-amber-200 animate-spin"
              style={{ animationDuration: '4s' }}
              aria-hidden="true"
            />
          </span>
          <span className="text-[10px] text-orange-100 font-semibold">
            Tire dúvidas sobre os resorts
          </span>
        </div>
      </button>
    </div>
  );
}
