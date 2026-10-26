import { updateMeasurementAttribution } from './measurementAttribution';

export interface MeasurementConsent {
  analytics: boolean;
  advertising: boolean;
}

const STORAGE_KEY = 'crcn.measurementConsent.v1';
const GTM_SCRIPT_ID = 'crcn-gtm-script';
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function pushConsentPreferences(
  consent: MeasurementConsent,
  createDataLayer = false,
): unknown[] | null {
  const measurementWindow = window as Window & { dataLayer?: unknown[] };
  let dataLayer = measurementWindow.dataLayer;
  if (!Array.isArray(dataLayer)) {
    if (!createDataLayer) return null;
    dataLayer = [];
    measurementWindow.dataLayer = dataLayer;
  }

  dataLayer.push({
    event: 'crcn_consent_preferences',
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.advertising ? 'granted' : 'denied',
    ad_user_data: consent.advertising ? 'granted' : 'denied',
    ad_personalization: consent.advertising ? 'granted' : 'denied',
  });

  return dataLayer;
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
  // Update an already-created data layer without loading GTM for a denied choice.
  pushConsentPreferences(consent);
  updateMeasurementAttribution(consent);
}

export function loadGtmIfConsented(consent: MeasurementConsent, configuredId: string): boolean {
  const id = configuredId.trim();
  if (!consent.analytics || !consent.advertising || !GTM_ID_PATTERN.test(id)) return false;
  if (document.getElementById(GTM_SCRIPT_ID)) return true;

  const dataLayer = pushConsentPreferences(consent, true);
  if (!dataLayer) return false;
  dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
  return true;
}
