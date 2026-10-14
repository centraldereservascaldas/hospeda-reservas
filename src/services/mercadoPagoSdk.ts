export interface MercadoPagoCardFormData {
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  installments: string | number;
  identificationType: string;
  identificationNumber: string;
}

interface MercadoPagoCardFormField {
  id: string;
  placeholder: string;
}

interface MercadoPagoCardFormOptions {
  amount: string;
  iframe: true;
  form: {
    id: string;
    cardNumber: MercadoPagoCardFormField;
    expirationDate: MercadoPagoCardFormField;
    securityCode: MercadoPagoCardFormField;
    cardholderName: MercadoPagoCardFormField;
    issuer: MercadoPagoCardFormField;
    installments: MercadoPagoCardFormField;
    identificationType: MercadoPagoCardFormField;
    identificationNumber: MercadoPagoCardFormField;
    cardholderEmail: MercadoPagoCardFormField;
  };
  callbacks: {
    onFormMounted: (error?: unknown) => void;
    onSubmit: (event: Event) => void;
    onInstallmentsReceived?: (error?: unknown, response?: MercadoPagoInstallmentsResponse) => void;
  };
}

interface MercadoPagoInstallmentCost {
  installments: number;
  installment_amount: number;
  total_amount: number;
}

interface MercadoPagoInstallmentsResponse {
  payer_costs?: MercadoPagoInstallmentCost[];
}

export interface MercadoPagoCardFormInstance {
  getCardFormData: () => MercadoPagoCardFormData;
  unmount: () => void;
}

interface MercadoPagoInstance {
  cardForm: (options: MercadoPagoCardFormOptions) => MercadoPagoCardFormInstance;
}

export interface MercadoPagoConstructor {
  new (publicKey: string, options: { locale: 'pt-BR' }): MercadoPagoInstance;
}

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

let mercadoPagoSdkPromise: Promise<MercadoPagoConstructor> | null = null;

export function loadMercadoPagoSdk(): Promise<MercadoPagoConstructor> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  if (mercadoPagoSdkPromise) return mercadoPagoSdkPromise;

  mercadoPagoSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-mercadopago-sdk="true"]',
    );
    const script = existingScript ?? document.createElement('script');

    const handleLoad = (): void => {
      if (window.MercadoPago) {
        resolve(window.MercadoPago);
      } else {
        mercadoPagoSdkPromise = null;
        script.remove();
        reject(new Error('MercadoPago.js indisponível.'));
      }
    };
    const handleError = (): void => {
      mercadoPagoSdkPromise = null;
      script.remove();
      reject(new Error('Falha ao carregar MercadoPago.js.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existingScript) {
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.mercadopagoSdk = 'true';
      document.head.append(script);
    }
  });

  return mercadoPagoSdkPromise;
}
