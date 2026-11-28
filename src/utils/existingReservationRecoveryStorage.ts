import { apiFetch } from '../services/apiFetch';

const prefix = 'crcn.existing-reservation.recovery.';
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const keyFor = (code: string, generation: string | null) =>
  `${prefix}${code}:${generation ?? 'initial'}`;

export function getExistingCheckoutRecoverySecret(
  code: string,
  generation: string | null,
): string | null {
  const key = keyFor(code, generation);
  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(key);
  } catch {
    stored = memory.get(key) ?? null;
  }
  return stored && /^(?:[a-f0-9]{128}|[a-f0-9]{144})$/.test(stored) ? stored : null;
}

export async function getOrCreateExistingCheckoutRecoverySecret(
  code: string,
  generation: string | null,
): Promise<string> {
  const existing = getExistingCheckoutRecoverySecret(code, generation);
  if (existing) return existing;
  const key = keyFor(code, generation);
  let request = pending.get(key);
  if (!request) {
    request = (async () => {
      const response = await apiFetch(
        `/api/existing-reservations/${encodeURIComponent(code)}/recovery-credential`,
        { method: 'POST', cache: 'no-store' },
      );
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !('credential' in data) ||
        typeof data.credential !== 'string' ||
        !/^[a-f0-9]{144}$/.test(data.credential)
      ) {
        throw new Error('Não foi possível preparar a recuperação do pedido. Tente novamente.');
      }
      try {
        window.sessionStorage.setItem(key, data.credential);
      } catch {
        throw new Error(
          'Não foi possível guardar a recuperação do pedido neste navegador. Tente novamente ou fale com o atendimento.',
        );
      }
      return data.credential;
    })();
    pending.set(key, request);
  }
  try {
    return await request;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

export function clearExistingCheckoutRecoverySecret(code: string, generation: string | null): void {
  const key = keyFor(code, generation);
  window.sessionStorage.removeItem(key);
  memory.delete(key);
}
