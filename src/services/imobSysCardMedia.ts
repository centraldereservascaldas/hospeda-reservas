import { apiFetch } from './apiFetch';
import { isRecord } from '../utils/apiValidation';
import { isImobSysPhotoUrl } from '../utils/propertyMedia';

let queue: Promise<void> = Promise.resolve();
const requests = new Map<string, Promise<string[]>>();

export function loadImobSysCardImages(id: string): Promise<string[]> {
  const existing = requests.get(id);
  if (existing) return existing;
  const request = queue.then(async () => {
    const url = '/api/accommodations/' + encodeURIComponent(id) + '/media';
    let response = await apiFetch(url);
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(60, Math.max(1, seconds || 60)) * 1000),
      );
      response = await apiFetch(url);
    }
    if (!response.ok) throw new Error('Fotos temporariamente indisponíveis.');
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      body.success !== true ||
      body.source !== 'imobsys-live' ||
      !isRecord(body.data) ||
      body.data.propertyId !== id ||
      !Array.isArray(body.data.images)
    ) {
      throw new Error('Resposta de fotos inválida.');
    }
    return body.data.images.filter(
      (image): image is string => typeof image === 'string' && isImobSysPhotoUrl(image),
    );
  });
  queue = request.then(
    () => undefined,
    () => undefined,
  );
  requests.set(id, request);
  void request.catch(() => requests.delete(id));
  return request;
}
