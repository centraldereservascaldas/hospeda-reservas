import { apiFetch } from './apiFetch';

export interface PartnerSandboxOrderInput {
  propertyId: string;
  from: string;
  to: string;
  guests: number;
  method: 'pix' | 'card';
  installments?: number;
  acceptedBaseCents: number;
  customer: { fullName: string; cpf: string; phone: string };
}

async function request(
  path: string,
  init?: Parameters<typeof fetch>[1],
): Promise<Record<string, unknown>> {
  const response = await apiFetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const result: unknown = await response.json();
  if (
    !response.ok ||
    !result ||
    typeof result !== 'object' ||
    !('success' in result) ||
    result.success !== true
  )
    throw new Error(
      'Não foi possível concluir esta etapa. Confira o pedido antes de tentar novamente.',
    );
  return result as Record<string, unknown>;
}

function path(reference: string): string {
  if (!/^[A-Za-z0-9]{40}$/.test(reference)) throw new Error('Referência inválida.');
  return `/api/partner-sandbox/checkout/${reference}`;
}

export const partnerSandboxCheckoutApi = {
  create: (input: PartnerSandboxOrderInput, idempotencyKey: string) =>
    request('/api/partner-sandbox/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }),
  startPayment: (reference: string, paymentToken?: string) =>
    request(`${path(reference)}/payment`, {
      method: 'POST',
      body: JSON.stringify(paymentToken ? { paymentToken } : {}),
    }),
  status: (reference: string) => request(path(reference)),
  reconcile: (reference: string) => request(`${path(reference)}/reconcile`, { method: 'POST' }),
};
