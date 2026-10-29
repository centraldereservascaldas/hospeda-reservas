export interface CieloSopResponse {
  PaymentToken?: string;
}

export type CieloSopEnvironment = 'sandbox' | 'production';

export interface CieloSopOptions {
  accessToken: string;
  environment: CieloSopEnvironment;
  language: 'pt';
  enableTokenize: false;
  onSuccess: (response: CieloSopResponse) => void;
  onError: (response: unknown) => void;
  onInvalid: (validationResults: unknown) => void;
}

export type CieloSopSubmit = (options: CieloSopOptions) => void;

declare global {
  interface Window {
    bpSop_silentOrderPost?: CieloSopSubmit;
  }
}

let cieloSopScriptPromise: Promise<void> | null = null;
const scriptTimeoutMs = 15_000;

export function loadCieloSopSdk(environment: CieloSopEnvironment = 'sandbox'): Promise<void> {
  if (window.bpSop_silentOrderPost) return Promise.resolve();
  if (cieloSopScriptPromise) return cieloSopScriptPromise;

  cieloSopScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-cielo-sop="true"]',
    );
    const script = existingScript ?? document.createElement('script');
    let timeoutId = 0;

    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const fail = (error: Error): void => {
      cleanup();
      cieloSopScriptPromise = null;
      script.remove();
      reject(error);
    };
    const handleLoad = (): void => {
      cleanup();
      if (window.bpSop_silentOrderPost) {
        resolve();
      } else {
        fail(new Error('Silent Order Post indisponível.'));
      }
    };
    const handleError = (): void => fail(new Error('Falha ao carregar Silent Order Post.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    timeoutId = window.setTimeout(
      () => fail(new Error('Tempo limite ao carregar Silent Order Post.')),
      scriptTimeoutMs,
    );

    if (!existingScript) {
      script.src =
        environment === 'production'
          ? 'https://www.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js'
          : 'https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js';
      script.async = true;
      script.dataset.cieloSop = 'true';
      document.head.append(script);
    }
  });

  return cieloSopScriptPromise;
}
