import { readMeasurementAttribution } from './measurementAttribution';
import { readMeasurementConsent } from './measurementConsent';

const STAYS_HOST_PATTERN = /(^|\.)stays\.(net|com\.br)$/;
const TRUSTED_CUSTOM_CHECKOUT_HOSTS = new Set([
  'www.centraldereservascaldas.com.br',
  'centraldereservascaldas.com.br',
]);
const FORWARDED_ATTRIBUTION_PARAMETERS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gbraid',
  'wbraid',
]);

export function isSafeStaysCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (STAYS_HOST_PATTERN.test(url.hostname.toLowerCase()) ||
        TRUSTED_CUSTOM_CHECKOUT_HOSTS.has(url.hostname.toLowerCase()))
    );
  } catch {
    return false;
  }
}

export function navigateToHostedCheckout(value: string): boolean {
  if (!isSafeStaysCheckoutUrl(value)) return false;

  const url = new URL(value);
  const attribution = readMeasurementAttribution(readMeasurementConsent());
  for (const [key, campaignValue] of Object.entries(attribution?.lastTouch.values ?? {})) {
    if (
      FORWARDED_ATTRIBUTION_PARAMETERS.has(key) &&
      typeof campaignValue === 'string' &&
      !url.searchParams.has(key)
    ) {
      url.searchParams.set(key, campaignValue);
    }
  }

  const link = document.createElement('a');
  link.href = url.toString();
  link.rel = 'noopener';
  link.hidden = true;
  link.dataset.staysCheckoutLink = 'true';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
