import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LogoCRCN } from '../LogoCRCN';

interface SofiaAssistantTriggerProps {
  onOpen: () => void;
  showMobileFloating?: boolean;
  compactMobileFloating?: boolean;
}

export function SofiaAssistantTrigger({
  onOpen,
  showMobileFloating = true,
  compactMobileFloating = false,
}: SofiaAssistantTriggerProps) {
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [isBookingPanelCovered, setIsBookingPanelCovered] = useState(false);
  const triggerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsFooterVisible(entry.isIntersecting);
    });

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let observedPanel: Element | null = null;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverlap);

    function updateOverlap(): void {
      const bookingPanel = document.querySelector('.property-booking-panel');
      const trigger = triggerContainerRef.current;
      if (bookingPanel !== observedPanel) {
        resizeObserver?.disconnect();
        observedPanel = bookingPanel;
        if (observedPanel) resizeObserver?.observe(observedPanel);
      }

      if (!bookingPanel || !trigger) {
        setIsBookingPanelCovered(false);
        return;
      }

      const triggerBounds = trigger.getBoundingClientRect();
      const panelBounds = bookingPanel.getBoundingClientRect();
      const overlaps =
        triggerBounds.left < panelBounds.right &&
        triggerBounds.right > panelBounds.left &&
        triggerBounds.top < panelBounds.bottom &&
        triggerBounds.bottom > panelBounds.top;
      setIsBookingPanelCovered(overlaps);
    }

    const mutationObserver = new window.MutationObserver(updateOverlap);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', updateOverlap, true);
    window.addEventListener('resize', updateOverlap);
    updateOverlap();

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', updateOverlap, true);
      window.removeEventListener('resize', updateOverlap);
    };
  }, []);

  const showTrigger = showMobileFloating && !isFooterVisible && !isBookingPanelCovered;

  return (
    <div
      ref={triggerContainerRef}
      aria-hidden={isBookingPanelCovered || undefined}
      inert={isBookingPanelCovered || undefined}
      className={`fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6 ${isBookingPanelCovered ? 'invisible pointer-events-none' : ''} ${showTrigger ? 'block' : 'hidden'} sm:block`}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`group flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-br from-orange-500/75 via-amber-400/70 to-orange-500/75 backdrop-blur-2xl text-white font-black text-xs shadow-[0_8px_26px_rgba(234,88,12,0.24),inset_0_1.5px_2px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(255,255,255,0.25)] border border-white/85 ring-1 ring-white/30 hover:from-orange-500/85 hover:via-amber-400/80 hover:to-orange-500/85 hover:scale-105 active:scale-95 transition-all cursor-pointer [@media(max-width:639px)_and_(max-height:400px)]:h-11 [@media(max-width:639px)_and_(max-height:400px)]:w-11 [@media(max-width:639px)_and_(max-height:400px)]:justify-center [@media(max-width:639px)_and_(max-height:400px)]:gap-0 [@media(max-width:639px)_and_(max-height:400px)]:p-1 ${compactMobileFloating ? '[@media(max-width:639px)_and_(max-height:639px)]:h-11 [@media(max-width:639px)_and_(max-height:639px)]:w-11 [@media(max-width:639px)_and_(max-height:639px)]:justify-center [@media(max-width:639px)_and_(max-height:639px)]:gap-0 [@media(max-width:639px)_and_(max-height:639px)]:p-1' : ''}`}
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
        <div
          className={`flex flex-col text-left [@media(max-width:639px)_and_(max-height:400px)]:sr-only ${compactMobileFloating ? '[@media(max-width:639px)_and_(max-height:639px)]:sr-only' : ''}`}
        >
          <span className="leading-tight flex items-center gap-1 font-black">
            Sofia • Assistente virtual
            <Sparkles
              className="w-3 h-3 text-amber-200 animate-spin"
              style={{ animationDuration: '4s' }}
              aria-hidden="true"
            />
          </span>
          <span className="text-[11px] text-orange-100 font-semibold">
            Tire dúvidas sobre hospedagens
          </span>
        </div>
      </button>
    </div>
  );
}
