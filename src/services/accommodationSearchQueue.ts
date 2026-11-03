import { RequestScheduler } from './requestScheduler';
import type { ScheduledRequestOptions } from './requestScheduler';
import type { SearchAccommodationsParams } from './crcnBackendApi';

const scheduler = new RequestScheduler(2);
let boundDocument: Document | undefined;
let unbind: (() => void) | undefined;

type DataConnection = EventTarget & { saveData?: boolean };

function observeEnvironment(): void {
  if (typeof document === 'undefined' || boundDocument === document) return;
  unbind?.();
  boundDocument = document;
  const observedDocument = document;
  const connection =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { connection?: DataConnection }).connection;
  const update = () => {
    scheduler.setBackgroundPaused(observedDocument.visibilityState === 'hidden');
    scheduler.setPrefetchPaused(connection?.saveData === true);
  };
  observedDocument.addEventListener('visibilitychange', update);
  connection?.addEventListener?.('change', update);
  unbind = () => {
    observedDocument.removeEventListener('visibilitychange', update);
    connection?.removeEventListener?.('change', update);
  };
  update();
}

export function scheduleAccommodationSearch<T>(
  params: SearchAccommodationsParams,
  request: (signal: AbortSignal) => Promise<T>,
  options: ScheduledRequestOptions,
): Promise<T> {
  observeEnvironment();
  const key = JSON.stringify([
    'accommodation-search',
    params.from || '',
    params.to || '',
    params.guests ?? 1,
    params.destination || '',
    params.propertyId || '',
    [...new Set(params.cities ?? [])].sort(),
    params.limit ?? 12,
    params.skip ?? 0,
  ]);
  return scheduler.schedule(key, request, options);
}
