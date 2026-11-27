import { useEffect, useRef, useState } from 'react';
import {
  loadGtmIfConsented,
  readMeasurementConsent,
  saveMeasurementConsent,
  type MeasurementConsent,
} from '../utils/measurementConsent';
import { readLegalPageSummaries, type LegalPageSummary } from '../utils/legalPages';

export const OPEN_MEASUREMENT_PREFERENCES = 'crcn:open-measurement-preferences';

export function MeasurementPreferences({
  showReopenButton = false,
  placement = 'fixed',
}: {
  showReopenButton?: boolean;
  placement?: 'fixed' | 'inline';
}) {
  const [savedConsent, setSavedConsent] = useState<MeasurementConsent | null>(
    readMeasurementConsent,
  );
  const [isOpen, setIsOpen] = useState(savedConsent === null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analyticsAccepted, setAnalyticsAccepted] = useState(savedConsent?.analytics ?? false);
  const [advertisingAccepted, setAdvertisingAccepted] = useState(
    savedConsent?.advertising ?? false,
  );
  const [legalPages, setLegalPages] = useState<LegalPageSummary[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusAfterCloseRef = useRef(false);
  const reopenButtonClassName =
    placement === 'inline'
      ? 'inline-flex min-h-11 w-fit items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700'
      : 'fixed bottom-4 right-4 z-[1100] min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';
  const panelClassName =
    placement === 'inline'
      ? 'w-full rounded-2xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-sm'
      : 'fixed inset-x-3 bottom-[calc(5rem_+_env(safe-area-inset-bottom,0px))] z-[1100] mx-auto max-h-[calc(100dvh_-_6rem_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))] max-w-7xl overflow-y-auto overscroll-contain rounded-2xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-xl sm:bottom-4 sm:max-h-[calc(100dvh_-_2rem)] sm:px-6 sm:py-4';

  useEffect(() => {
    if (placement !== 'fixed' || !isOpen) return;

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
  }, [isOpen, placement]);

  useEffect(() => {
    const open = () => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIsCustomizing(false);
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
        (
          reopenButtonRef.current ??
          document.querySelector<HTMLButtonElement>('[data-measurement-preferences-trigger]')
        )?.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (savedConsent) {
      loadGtmIfConsented(
        savedConsent,
        import.meta.env?.VITE_GTM_ID ?? '',
        import.meta.env?.VITE_GA_ID ?? '',
      );
    }
  }, [savedConsent]);

  const save = (choice: MeasurementConsent) => {
    const hadLoadedGtm = Boolean(document.getElementById('crcn-gtm-script'));
    saveMeasurementConsent(choice);
    setSavedConsent(choice);
    restoreFocusAfterCloseRef.current = true;
    setIsOpen(false);
    if (hadLoadedGtm && (!choice.analytics || !choice.advertising)) {
      window.location.reload();
    }
  };

  if (!isOpen) {
    return showReopenButton ? (
      <button
        ref={reopenButtonRef}
        type="button"
        onClick={(event) => {
          returnFocusRef.current = event.currentTarget;
          setIsCustomizing(false);
          setIsOpen(true);
        }}
        className={reopenButtonClassName}
      >
        Preferências de medição
      </button>
    ) : null;
  }

  const privacyPage = legalPages.find((page) => page.slug === 'privacidade');
  const termsPage = legalPages.find((page) => page.slug === 'termos');

  return (
    <section
      aria-labelledby="measurement-preferences-title"
      data-dialog-focus-portal={placement === 'fixed' ? '' : undefined}
      className={panelClassName}
    >
      <h2
        ref={titleRef}
        tabIndex={-1}
        id="measurement-preferences-title"
        className="text-base font-bold focus:outline-none"
      >
        Privacidade e medição
      </h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5">
            Usamos cookies para medir o uso do site e avaliar campanhas. Você pode mudar essa
            escolha depois.
          </p>
          {(privacyPage || termsPage) && (
            <nav
              aria-label="Documentos legais"
              className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-xs sm:text-sm"
            >
              {privacyPage && (
                <a
                  href={privacyPage.path}
                  className="min-h-11 inline-flex items-center text-neutral-700 underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  Política de privacidade
                </a>
              )}
              {termsPage && (
                <a
                  href={termsPage.path}
                  className="min-h-11 inline-flex items-center text-neutral-700 underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  Termos de uso
                </a>
              )}
            </nav>
          )}
        </div>
        {isCustomizing && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:shrink-0">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={analyticsAccepted}
                onChange={(event) => setAnalyticsAccepted(event.target.checked)}
              />
              Analytics (medição de uso)
            </label>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={advertisingAccepted}
                onChange={(event) => setAdvertisingAccepted(event.target.checked)}
              />
              Publicidade
            </label>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0 sm:items-center">
          <button
            type="button"
            onClick={() => save({ analytics: false, advertising: false })}
            className="min-h-11 min-w-0 break-words rounded-xl px-1 text-center text-xs leading-tight font-semibold text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:px-4 sm:text-sm sm:leading-normal"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => {
              if (isCustomizing) {
                save({ analytics: analyticsAccepted, advertising: advertisingAccepted });
                return;
              }

              setAnalyticsAccepted(savedConsent?.analytics ?? false);
              setAdvertisingAccepted(savedConsent?.advertising ?? false);
              setIsCustomizing(true);
            }}
            className="min-h-11 min-w-0 break-words rounded-xl border border-neutral-300 px-1 text-center text-xs leading-tight font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:px-4 sm:text-sm sm:leading-normal"
          >
            {isCustomizing ? 'Salvar escolhas' : 'Personalizar'}
          </button>
          <button
            type="button"
            onClick={() => save({ analytics: true, advertising: true })}
            className="min-h-11 min-w-0 break-words rounded-xl bg-orange-700 px-1 text-center text-xs leading-tight font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:px-4 sm:text-sm sm:leading-normal"
          >
            Aceitar tudo
          </button>
        </div>
      </div>
    </section>
  );
}
