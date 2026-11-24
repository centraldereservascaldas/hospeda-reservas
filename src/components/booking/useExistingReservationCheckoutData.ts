import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from '../../services/apiFetch';
import { isLegalPage, type LegalPage } from '../../utils/legalPages';
import { existingReservationUrl } from '../../utils/checkoutUrl';
import {
  isCompletedSummary,
  isSummary,
  type ReservationSummary,
} from './existingReservationSummary';

export type ExistingReservationCheckoutDataState = 'loading' | 'ready' | 'error';

interface UseExistingReservationCheckoutDataOptions {
  code: string;
  refreshKey: number;
}

interface ExistingReservationCheckoutData {
  summary: ReservationSummary | null;
  completed: boolean;
  state: ExistingReservationCheckoutDataState;
  contractLoading: boolean;
  contract: (LegalPage & { contentHash: string }) | null;
  plan: 'full' | 'deposit';
  setPlan: Dispatch<SetStateAction<'full' | 'deposit'>>;
  method: 'pix' | 'card';
  setMethod: Dispatch<SetStateAction<'pix' | 'card'>>;
}

export function useExistingReservationCheckoutData({
  code,
  refreshKey,
}: UseExistingReservationCheckoutDataOptions): ExistingReservationCheckoutData {
  const [summary, setSummary] = useState<ReservationSummary | null>(null);
  const [completed, setCompleted] = useState(false);
  const [state, setState] = useState<ExistingReservationCheckoutDataState>('loading');
  const [contractLoading, setContractLoading] = useState(true);
  const [contract, setContract] = useState<(LegalPage & { contentHash: string }) | null>(null);
  const [plan, setPlan] = useState<'full' | 'deposit'>('full');
  const [method, setMethod] = useState<'pix' | 'card'>('pix');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setCompleted(false);
    void apiFetch(`/api/existing-reservations/${encodeURIComponent(code)}/checkout-summary`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ success: boolean; reservation: unknown }>)
          : null,
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data?.success) {
          setState('error');
          return;
        }
        if (isCompletedSummary(data.reservation, code)) {
          setSummary(null);
          setCompleted(true);
          setState('ready');
          return;
        }
        if (!isSummary(data.reservation, code)) {
          setState('error');
          return;
        }
        setCompleted(false);
        setSummary(data.reservation);
        const initialPlan = data.reservation.paymentMethods.length > 0 ? 'full' : 'deposit';
        const initialMethods =
          initialPlan === 'full'
            ? data.reservation.paymentMethods
            : (data.reservation.paymentPlans?.deposit.methods ?? []);
        setPlan(initialPlan);
        setMethod(initialMethods.includes('pix') ? 'pix' : 'card');
        window.history.replaceState(
          null,
          '',
          existingReservationUrl(code, data.reservation, window.location.search),
        );
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [code, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch('/api/public/legal-pages/contrato', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: unknown) => {
        const page = result && typeof result === 'object' && 'page' in result ? result.page : null;
        if (
          !controller.signal.aborted &&
          isLegalPage(page) &&
          page.slug === 'contrato' &&
          'contentHash' in page &&
          typeof page.contentHash === 'string' &&
          /^[a-f0-9]{64}$/.test(page.contentHash)
        ) {
          setContract(page as LegalPage & { contentHash: string });
        }
        if (!controller.signal.aborted) setContractLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContractLoading(false);
      });
    return () => controller.abort();
  }, []);

  return { summary, completed, state, contractLoading, contract, plan, setPlan, method, setMethod };
}
