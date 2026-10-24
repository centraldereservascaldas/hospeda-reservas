import { useEffect, useRef, useState } from 'react';
import {
  loadGtmIfConsented,
  readMeasurementConsent,
  saveMeasurementConsent,
  type MeasurementConsent,
} from '../utils/measurementConsent';

export const OPEN_MEASUREMENT_PREFERENCES = 'crcn:open-measurement-preferences';

export function MeasurementPreferences({ showReopenButton = false }: { showReopenButton?: boolean }) {
  const [savedConsent, setSavedConsent] = useState<MeasurementConsent | null>(readMeasurementConsent);
  const [accepted, setAccepted] = useState(
    Boolean(savedConsent?.analytics && savedConsent.advertising),
  );
  const [isOpen, setIsOpen] = useState(savedConsent === null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusAfterCloseRef = useRef(false);

  useEffect(() => {
    const open = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIsOpen(true);
    };
    window.addEventListener(OPEN_MEASUREMENT_PREFERENCES, open);
    return () => window.removeEventListener(OPEN_MEASUREMENT_PREFERENCES, open);
  }, []);

  useEffect(() => {
    if (isOpen) {
      titleRef.current?.focus();
    } else if (restoreFocusAfterCloseRef.current) {
      restoreFocusAfterCloseRef.current = false;
      const previous = returnFocusRef.current;
      if (previous?.isConnected) {
        previous.focus();
      } else {
        (reopenButtonRef.current ?? document.querySelector<HTMLButtonElement>('[data-measurement-preferences-trigger]'))?.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (savedConsent) {
      loadGtmIfConsented(savedConsent, import.meta.env?.VITE_GTM_ID ?? '');
    }
  }, [savedConsent]);

  const save = (choice: MeasurementConsent) => {
    const hadLoadedGtm = Boolean(document.getElementById('crcn-gtm-script'));
    saveMeasurementConsent(choice);
    setSavedConsent(choice);
    setAccepted(choice.analytics && choice.advertising);
    restoreFocusAfterCloseRef.current = true;
    setIsOpen(false);
    if (hadLoadedGtm && (!choice.analytics || !choice.advertising)) {
      window.location.reload();
    }
  };

  if (!isOpen) {
    return showReopenButton ? (
      <button ref={reopenButtonRef} type="button" onClick={(event) => { returnFocusRef.current = event.currentTarget; setIsOpen(true); }} className="fixed bottom-4 right-4 z-[1100] min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
        Preferências de medição
      </button>
    ) : null;
  }

  return (
    <section
      aria-labelledby="measurement-preferences-title"
      className="fixed inset-x-3 bottom-[calc(5rem_+_env(safe-area-inset-bottom,0px))] z-[1100] mx-auto max-w-lg rounded-2xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-xl sm:bottom-4"
    >
      <h2 ref={titleRef} tabIndex={-1} id="measurement-preferences-title" className="text-base font-bold focus:outline-none">
        Preferências de medição
      </h2>
      <p className="mt-2 text-sm leading-5">
        Escolha se podemos carregar ferramentas de medição e publicidade. Você pode mudar sua
        escolha pelo controle “Preferências de medição”. Ao revogar, a página recarrega para interromper as tags; a remoção de
        cookies existentes depende da configuração dessas ferramentas.
      </p>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          Permitir medição e publicidade
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => save({ analytics: false, advertising: false })} className="min-h-11 rounded-xl border border-neutral-400 px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
          Recusar
        </button>
        <button type="button" onClick={() => save({ analytics: accepted, advertising: accepted })} className="min-h-11 rounded-xl bg-orange-700 px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
          Salvar escolhas
        </button>
      </div>
    </section>
  );
}
