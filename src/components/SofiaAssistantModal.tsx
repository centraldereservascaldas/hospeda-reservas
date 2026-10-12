import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  X, 
  ChevronRight, 
  Filter
} from 'lucide-react';
import { Property, Currency } from '../types';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { formatCurrency } from '../utils/formatters';
import { LogoCRCN } from './LogoCRCN';
import { useDialogFocus } from './useDialogFocus';

interface ChatMessage {
  id: string;
  sender: 'sofia' | 'user';
  text: string;
  properties?: Property[];
  suggestedFilters?: { destination?: string; guests?: number; from?: string; to?: string };
  assistantSource?: 'openai' | 'catalog';
  timestamp: string;
}

interface SofiaAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: Currency;
  onSelectProperty: (property: Property) => void;
  onApplyFilters?: (filters: { destination?: string; guests?: number }) => void;
}

export const SofiaAssistantModal: React.FC<SofiaAssistantModalProps> = ({
  isOpen,
  onClose,
  currency,
  onSelectProperty,
  onApplyFilters,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'sofia',
      text: 'Olá! Sou a Sofia, Concierge da Central de Reservas Caldas Novas. ✨\n\nPosso te ajudar a encontrar o apartamento ideal, tirar dúvidas sobre regras dos condomínios (como descer com bebidas e coolers), ingressos para os parques aquáticos e capacidade para sua família.\n\nComo posso ajudar você hoje?',
      timestamp: 'Agora',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: inputRef });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollToBottom();
      }, 150);
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await crcnBackendApi.chatWithSofia(text, messages.slice(-10).map((item) => ({
        role: item.sender === 'sofia' ? 'assistant' : 'user',
        content: item.text,
      })));
      const sofiaMsg: ChatMessage = {
        id: `sofia-${Date.now()}`,
        sender: 'sofia',
        text: response.reply,
        properties: response.matchedProperties,
        suggestedFilters: response.suggestedFilters,
        assistantSource: response.assistant,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, sofiaMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `sofia-err-${Date.now()}`,
          sender: 'sofia',
          text: 'A Sofia está temporariamente indisponível para consultar essa informação. Tente novamente em instantes.',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-white/20 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div 
        ref={dialogRef}
        data-dialog-focus-root
        role="dialog"
        aria-modal="true"
        aria-labelledby="sofia-assistant-title"
        tabIndex={-1}
        className="w-full max-w-xl h-[min(92dvh,800px)] sm:h-[min(88dvh,680px)] max-h-full min-h-0 rounded-3xl shadow-[0_24px_80px_-20px_rgba(15,23,42,0.28)] border border-white/75 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.48), rgba(255,255,255,0.30))',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        }}
      >
        {/* Header */}
        <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-orange-500/75 via-orange-400/68 to-amber-400/65 px-4 py-3 text-white shadow-[0_8px_24px_rgba(234,88,12,0.12)] backdrop-blur-xl border-b border-white/45 sm:px-5 sm:py-4 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/70">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/45 shadow-sm backdrop-blur-xl">
              <LogoCRCN size="sm" showText={false} className="!gap-0 scale-[0.72]" />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 id="sofia-assistant-title" className="font-extrabold text-base leading-tight">Sofia</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-[10px] font-bold backdrop-blur-xl border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]">
                  Concierge IA CRCN
                </span>
              </div>
              <p className="text-xs text-orange-100 font-medium">
                Conectada ao catálogo de acomodações
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar assistente Sofia"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 border border-white/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)] backdrop-blur-xl flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-white/10 backdrop-blur-sm p-3 sm:p-5">
          {messages.map((msg) => {
            const isSofia = msg.sender === 'sofia';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isSofia ? 'items-start' : 'items-end justify-end'}`}
              >
                {isSofia && (
                  <div className="w-8 h-8 rounded-full liquid-glass-button text-orange-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-2.5 ${isSofia ? 'text-left' : 'text-right'}`}>
                  {/* Bubble */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs ${
                      isSofia
                        ? 'bg-white/45 backdrop-blur-lg text-neutral-800 border border-white/70 shadow-[0_8px_24px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.65)] rounded-tl-xs'
                        : 'liquid-glass-accent text-white rounded-tr-xs font-medium'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>
                    {/* Filter Suggestion Button */}
                    {isSofia && msg.suggestedFilters && Object.values(msg.suggestedFilters).some((value) => value !== undefined && value !== '') && onApplyFilters && (
                      <div className="mt-3 pt-2.5 border-t border-white/70 flex items-center justify-between">
                        <span className="text-[11px] text-neutral-500 font-medium">
                          Deseja ver na vitrine principal?
                        </span>
                        <button
                          onClick={() => {
                            if (msg.suggestedFilters) {
                              onApplyFilters(msg.suggestedFilters);
                              onClose();
                            }
                          }}
                          className="px-3 py-1 rounded-xl liquid-glass-pill hover:bg-white/90 text-orange-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 border border-orange-200/70"
                        >
                          <Filter className="w-3 h-3 text-orange-600" />
                          <span>Aplicar filtros no site</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Property Cards Embedded */}
                  {isSofia && msg.properties && msg.properties.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {msg.properties.map((prop) => (
                        <button
                          key={prop.id}
                          type="button"
                          aria-label={`Ver detalhes de ${prop.title}`}
                          onClick={() => {
                            onSelectProperty(prop);
                            onClose();
                          }}
                          className="flex w-full items-center gap-3 p-2.5 rounded-2xl text-left liquid-glass-button hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                        >
                          <img
                            src={prop.images[0]}
                            alt=""
                            className="w-16 h-16 rounded-xl object-cover flex-shrink-0 group-hover:scale-105 transition-transform"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-xs text-neutral-900 truncate group-hover:text-orange-600 transition-colors">
                              {prop.title}
                            </h4>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {prop.location.neighborhood || 'Caldas Novas'} • Até {prop.maxGuests} hóspedes
                            </p>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-xs font-black text-neutral-900">
                                {Number.isFinite(prop.pricePerNight) && prop.pricePerNight > 0 ? (
                                  <>
                                    {formatCurrency(prop.pricePerNight, currency)}{' '}
                                    <span className="text-[10px] font-normal text-neutral-500">/noite</span>
                                  </>
                                ) : (
                                  <span className="text-[10px] font-semibold text-neutral-500">Consulte valores nas datas</span>
                                )}
                              </span>
                              <span className="text-[11px] font-bold text-orange-600 flex items-center gap-0.5">
                                <span>Ver detalhes</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="text-[10px] text-neutral-400 block px-1">
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-neutral-500 pl-11">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
              <span>Sofia está consultando o catálogo e as regras dos condomínios...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex flex-shrink-0 items-center gap-2 border-t border-white/55 bg-white/25 backdrop-blur-xl p-3 sm:p-4"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Pergunte sobre condomínios, regras de bebidas, ingressos..."
            className="min-w-0 flex-1 rounded-2xl border border-white/75 bg-white/40 px-4 py-3 text-xs text-neutral-900 shadow-[inset_0_1px_3px_rgba(15,23,42,0.03),0_2px_8px_rgba(15,23,42,0.03)] backdrop-blur-lg outline-none transition-all placeholder:text-neutral-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:bg-white/60 sm:text-sm"
          />

          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="liquid-glass-accent p-3 rounded-2xl text-white font-bold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:hover:scale-100 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
