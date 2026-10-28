import { updateMeasurementAttribution } from './measurementAttribution';

export interface MeasurementConsent {
  analytics: boolean;
  advertising: boolean;
}

const STORAGE_KEY = 'crcn.measurementConsent.v1';
const GTM_SCRIPT_ID = 'crcn-gtm-script';
const GOOGLE_TAG_SCRIPT_ID = 'crcn-google-tag-script';
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;
const GA_ID_PATTERN = /^G-[A-Z0-9]+$/;
const CONSENT_DEFAULT_SET_KEY = '__crcnConsentModeDefaultSet';
const CHECKOUT_LINKER_DOMAINS = ['centraldereservascaldas.com.br', 'stays.net'];

type GoogleConsentState = 'granted' | 'denied';

interface GoogleConsentParameters {
  analytics_storage: GoogleConsentState;
  ad_storage: GoogleConsentState;
  ad_user_data: GoogleConsentState;
  ad_personalization: GoogleConsentState;
}

type MeasurementWindow = Window & {
  dataLayer?: unknown[];
  [CONSENT_DEFAULT_SET_KEY]?: boolean;
};

function toGoogleConsentParameters(consent: MeasurementConsent): GoogleConsentParameters {
  return {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.advertising ? 'granted' : 'denied',
    ad_user_data: consent.advertising ? 'granted' : 'denied',
    ad_personalization: consent.advertising ? 'granted' : 'denied',
  };
}

function pushGoogleConsentCommand(
  dataLayer: unknown[],
  command: 'default' | 'update',
  parameters: GoogleConsentParameters,
): void {
  // Google tag commands are queued as the Arguments object from the gtag call.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function gtag(..._args: unknown[]): void {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }

  gtag('consent', command, parameters);
}

function getDataLayer(createDataLayer = false): unknown[] | null {
  const measurementWindow = window as MeasurementWindow;
  let dataLayer = measurementWindow.dataLayer;
  if (!Array.isArray(dataLayer)) {
    if (!createDataLayer) return null;
    dataLayer = [];
    measurementWindow.dataLayer = dataLayer;
  }

  return dataLayer;
}

function pushConsentPreferences(consent: MeasurementConsent, dataLayer: unknown[]): void {
  dataLayer.push({
    event: 'crcn_consent_preferences',
    ...toGoogleConsentParameters(consent),
  });
}

export function readMeasurementConsent(): MeasurementConsent | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value !== null &&
      typeof value === 'object' &&
      'analytics' in value &&
      'advertising' in value &&
      typeof value.analytics === 'boolean' &&
      typeof value.advertising === 'boolean'
    ) {
      return { analytics: value.analytics, advertising: value.advertising };
    }
  } catch {
    // Storage can be unavailable in private browsing or restrictive environments.
  }
  return null;
}

export function saveMeasurementConsent(consent: MeasurementConsent): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // The choice still applies to the current page.
  }
  // Do not create a layer or load GTM from this update path.
  const measurementWindow = window as MeasurementWindow;
  const dataLayer = measurementWindow.dataLayer;
  if (Array.isArray(dataLayer)) {
    pushGoogleConsentCommand(dataLayer, 'update', toGoogleConsentParameters(consent));
    pushConsentPreferences(consent, dataLayer);
  }
  updateMeasurementAttribution(consent);
}

export function loadGtmIfConsented(
  consent: MeasurementConsent,
  configuredId: string,
  configuredGaId = '',
): boolean {
  const id = configuredId.trim();
  const gaId = configuredGaId.trim();
  const shouldLoadGoogleTag = consent.analytics && GA_ID_PATTERN.test(gaId);
  const shouldLoadGtm = consent.analytics && consent.advertising && GTM_ID_PATTERN.test(id);
  if (!shouldLoadGoogleTag && !shouldLoadGtm) return false;
  if (
    (!shouldLoadGoogleTag || document.getElementById(GOOGLE_TAG_SCRIPT_ID)) &&
    (!shouldLoadGtm || document.getElementById(GTM_SCRIPT_ID))
  ) {
    return true;
  }

  const dataLayer = getDataLayer(true);
  if (!dataLayer) return false;
  const measurementWindow = window as MeasurementWindow;
  if (!measurementWindow[CONSENT_DEFAULT_SET_KEY]) {
    pushGoogleConsentCommand(dataLayer, 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    measurementWindow[CONSENT_DEFAULT_SET_KEY] = true;
  }
  pushGoogleConsentCommand(dataLayer, 'update', toGoogleConsentParameters(consent));
  pushConsentPreferences(consent, dataLayer);

  if (shouldLoadGoogleTag && !document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
    const activeDataLayer = dataLayer;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function gtag(..._args: unknown[]): void {
      // eslint-disable-next-line prefer-rest-params
      activeDataLayer.push(arguments);
    }

    gtag('js', new Date());
    gtag('set', { currency: 'BRL' });
    gtag('config', gaId, {
      linker: {
        domains: CHECKOUT_LINKER_DOMAINS,
        accept_incoming: true,
        decorate_forms: true,
      },
    });

    const googleTagScript = document.createElement('script');
    googleTagScript.id = GOOGLE_TAG_SCRIPT_ID;
    googleTagScript.async = true;
    googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.append(googleTagScript);
  }

  if (shouldLoadGtm && !document.getElementById(GTM_SCRIPT_ID)) {
    dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.id = GTM_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.append(script);
  }

  return true;
}
