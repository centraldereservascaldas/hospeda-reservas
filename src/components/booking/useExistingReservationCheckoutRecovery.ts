import { useEffect, useMemo, useState } from 'react';
import { checkoutApi } from '../../services/checkoutApi';
import {
  clearExistingCheckoutRecoverySecret,
  getExistingCheckoutRecoverySecret,
} from '../../utils/existingReservationRecoveryStorage';
import { getCheckoutResumeToken, saveCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import {
  clearExistingReservationResumeReference,
  getExistingReservationResumeReference,
  saveExistingReservationResumeReference,
} from '../../utils/existingReservationResumeStorage';
import { apiFetch } from '../../services/apiFetch';

type PreviousReferenceState = 'checking' | 'blocked' | 'unavailable' | 'settled';
type RecoveryState = 'checking' | 'clear' | 'error';

export function useExistingReservationCheckoutRecovery({
  code,
  renewalGeneration,
  accessToken,
}: {
  code: string;
  renewalGeneration: string | null;
  accessToken: string | null;
}) {
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [recoveryRetry, setRecoveryRetry] = useState(0);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [recoveredReference, setRecoveredReference] = useState<string | null>(null);
  const [settledPreviousReference, setSettledPreviousReference] = useState<string | null>(null);
  const [previousReferenceCheckRetry, setPreviousReferenceCheckRetry] = useState(0);
  const [previousReferenceCheckState, setPreviousReferenceCheckState] =
    useState<PreviousReferenceState>('checking');

  const previousReference = useMemo(
    () => (renewalGeneration ? null : getExistingReservationResumeReference(code)),
    [code, renewalGeneration],
  );
  const previousReferenceBlocksPayment =
    previousReference !== null && settledPreviousReference !== previousReference;

  useEffect(() => {
    if (!previousReference || settledPreviousReference === previousReference) return;
    const resumeToken = getCheckoutResumeToken(previousReference);
    if (!resumeToken) {
      setPreviousReferenceCheckState('unavailable');
      return;
    }

    let isCurrent = true;
    setPreviousReferenceCheckState('checking');
    void checkoutApi
      .resumeCheckout(previousReference, resumeToken)
      .then((result) => {
        if (!isCurrent) return;
        const order = result.kind === 'ready' ? result.data.order : null;
        const attempt = result.kind === 'ready' ? result.data.payment.attempt : null;
        const depositWasReconciled =
          order?.origin === 'stays_existing' &&
          order.status === 'entrada_conciliada' &&
          order.paymentStatus === 'approved' &&
          order.reservationConfirmed &&
          order.existingDepositReviewRequired === false &&
          attempt?.status === 'approved' &&
          attempt.paidAt !== null;

        if (!depositWasReconciled) {
          setPreviousReferenceCheckState(result.kind === 'unavailable' ? 'unavailable' : 'blocked');
          return;
        }

        clearExistingReservationResumeReference(code);
        setPreviousReferenceCheckState('settled');
        setSettledPreviousReference(previousReference);
        setSummaryRetry((current) => current + 1);
      })
      .catch(() => {
        if (isCurrent) setPreviousReferenceCheckState('unavailable');
      });

    return () => {
      isCurrent = false;
    };
  }, [code, previousReference, previousReferenceCheckRetry, settledPreviousReference]);

  useEffect(() => {
    if (!accessToken) return;
    if (previousReference) {
      setRecoveryState('clear');
      return;
    }
    const secret = getExistingCheckoutRecoverySecret(code, renewalGeneration);
    if (!secret) {
      setRecoveryState('clear');
      return;
    }
    setRecoveryState('checking');
    const controller = new AbortController();
    void apiFetch(`/api/existing-reservations/${encodeURIComponent(code)}/recover`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'X-Checkout-Recovery-Secret': secret, Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((data) => {
        if (
          !controller.signal.aborted &&
          data &&
          typeof data === 'object' &&
          'restart' in data &&
          data.restart === true
        ) {
          try {
            clearExistingCheckoutRecoverySecret(code, renewalGeneration);
            setRecoveryState('clear');
          } catch {
            setRecoveryState('error');
          }
          return;
        }
        if (
          controller.signal.aborted ||
          !data ||
          typeof data !== 'object' ||
          !('resume' in data) ||
          !data.resume ||
          typeof data.resume !== 'object'
        ) {
          if (!controller.signal.aborted) setRecoveryState('error');
          return;
        }
        const resume = data.resume as Record<string, unknown>;
        if (
          typeof resume.reference !== 'string' ||
          !/^[A-Za-z0-9]{40}$/.test(resume.reference) ||
          typeof resume.token !== 'string' ||
          !/^[A-Za-z0-9]{64}$/.test(resume.token) ||
          typeof resume.expiresAt !== 'string' ||
          !Number.isFinite(Date.parse(resume.expiresAt)) ||
          Date.parse(resume.expiresAt) <= Date.now()
        ) {
          setRecoveryState('error');
          return;
        }
        saveCheckoutResumeToken(resume.reference, resume.token, resume.expiresAt);
        saveExistingReservationResumeReference(code, resume.reference);
        setRecoveredReference(resume.reference);
        setRecoveryState('clear');
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecoveryState('error');
      });
    return () => controller.abort();
  }, [accessToken, code, previousReference, renewalGeneration, recoveryRetry]);

  return {
    previousReference,
    previousReferenceBlocksPayment,
    previousReferenceCheckState,
    retryPreviousReferenceCheck: () => setPreviousReferenceCheckRetry((current) => current + 1),
    recoveryState,
    retryRecovery: () => setRecoveryRetry((current) => current + 1),
    recoveredReference,
    summaryRetry,
    retrySummary: () => setSummaryRetry((current) => current + 1),
  };
}
