import { useCallback, useEffect, useRef, useState } from 'react';
import type { Property } from '../../types';
import { crcnBackendApi, getCalendarExpiration } from '../../services/crcnBackendApi';
import { usePropertyQuote } from './usePropertyQuote';
import type { StaysCalendarDay } from '../../utils/staysAvailability';

const CALENDAR_TTL_MS = 45_000;
const calendarCache = new Map<string, { days: StaysCalendarDay[]; expiresAt: number }>();
const requesterIds = new WeakMap<typeof crcnBackendApi.getAccommodationCalendar, number>();
let nextRequesterId = 0;
const calendarRequests = new Map<string, Promise<StaysCalendarDay[]>>();

const addCalendarDays = (value: string, count: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

function requestCalendar(listingId: string, from: string, to: string): Promise<StaysCalendarDay[]> {
  const requester = crcnBackendApi.getAccommodationCalendar;
  if (!requesterIds.has(requester)) requesterIds.set(requester, ++nextRequesterId);
  const key = JSON.stringify([requesterIds.get(requester), listingId, from, to]);
  const cached = calendarCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.days);
  const pending = calendarRequests.get(key);
  if (pending) return pending;
  const request = crcnBackendApi
    .getAccommodationCalendar(listingId, from, to)
    .then((days) => {
      const expiresAt = getCalendarExpiration(days);
      if (expiresAt !== undefined && expiresAt <= Date.now())
        throw new Error('Calendar response expired');
      if (
        days.length > 0 &&
        expiresAt &&
        expiresAt > Date.now() &&
        contiguousCoverageEnd(days, from, to) === to
      ) {
        calendarCache.set(key, {
          days,
          expiresAt: Math.min(expiresAt, Date.now() + CALENDAR_TTL_MS),
        });
        // Bound memory independently of the number of properties visited.
        if (calendarCache.size > 100) calendarCache.delete(calendarCache.keys().next().value!);
      }
      return days;
    })
    .finally(() => calendarRequests.delete(key));
  calendarRequests.set(key, request);
  return request;
}

function contiguousCoverageEnd(days: StaysCalendarDay[], from: string, to: string): string {
  const dates = new Set(days.map((day) => day.date));
  let end = '';
  for (let date = from; date <= to && dates.has(date); date = addCalendarDays(date, 1)) end = date;
  return end;
}

interface UsePropertyAvailabilityOptions {
  property: Property | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  todayIso: string;
}

export function usePropertyAvailability({
  property,
  checkIn,
  checkOut,
  guests,
  todayIso,
}: UsePropertyAvailabilityOptions) {
  const [calendarDays, setCalendarDays] = useState<StaysCalendarDay[]>([]);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const calendarSnapshotRef = useRef({
    contextKey: '',
    days: [] as StaysCalendarDay[],
    coverageEnd: '',
  });
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [calendarCoverageEnd, setCalendarCoverageEnd] = useState('');
  const [calendarExpiresAt, setCalendarExpiresAt] = useState<number | null>(null);
  const calendarGenerationRef = useRef(0);
  const incompleteInitialWindowRef = useRef(false);
  const [isExtendingCalendar, setIsExtendingCalendar] = useState(false);
  const [calendarExtensionMessage, setCalendarExtensionMessage] = useState('');
  const [calendarExtensionToken, setCalendarExtensionToken] = useState(0);
  const extensionInFlightContextKeyRef = useRef('');
  const failedExtensionContextRef = useRef('');
  const latestCalendarContextKeyRef = useRef('');
  const extensionTargetRef = useRef<{ contextKey: string; targetDate: string } | null>(null);
  const [calendarContextKey, setCalendarContextKey] = useState('');
  const listingId = property ? property.staysListingId || property.id : '';
  calendarSnapshotRef.current = {
    contextKey: calendarContextKey,
    days: calendarDays,
    coverageEnd: calendarCoverageEnd,
  };
  const requestedCalendarContextKey = property
    ? JSON.stringify([property.id, property.staysListingId || property.id, todayIso])
    : '';
  useEffect(() => {
    latestCalendarContextKeyRef.current = requestedCalendarContextKey;
  }, [requestedCalendarContextKey]);
  const quote = usePropertyQuote({ listingId, checkIn, checkOut, guests });

  useEffect(() => {
    calendarGenerationRef.current += 1;
    extensionInFlightContextKeyRef.current = '';
    if (!listingId) {
      setCalendarExpiresAt(null);
      setIsRefreshingCalendar(false);
      extensionTargetRef.current = null;
      setCalendarDays([]);
      setCalendarAvailable(false);
      setCalendarMessage('');
      setIsLoadingCalendar(false);
      setCalendarContextKey('');
      setCalendarCoverageEnd('');
      setCalendarExtensionMessage('');
      setIsExtendingCalendar(false);
      return;
    }

    let isMounted = true;
    const calendarStart = todayIso;
    const calendarEnd = new Date(new Date(`${calendarStart}T12:00:00`).getTime() + 90 * 86400000)
      .toISOString()
      .slice(0, 10);

    const previous = calendarSnapshotRef.current;
    const isRefresh =
      previous.contextKey === requestedCalendarContextKey && previous.days.length > 0;
    const targetEnd =
      isRefresh && previous.coverageEnd > calendarEnd ? previous.coverageEnd : calendarEnd;
    if (!isRefresh) {
      setCalendarExpiresAt(null);
      setCalendarAvailable(false);
      setCalendarDays([]);
      setCalendarCoverageEnd('');
      extensionTargetRef.current = null;
    }
    incompleteInitialWindowRef.current = false;
    setCalendarMessage(
      isRefresh ? 'Atualizando disponibilidade...' : 'Consultando disponibilidade...',
    );
    setIsLoadingCalendar(!isRefresh);
    setIsRefreshingCalendar(isRefresh);
    failedExtensionContextRef.current = '';
    setCalendarExtensionMessage('');
    setIsExtendingCalendar(false);
    setCalendarContextKey(requestedCalendarContextKey);
    const windows: Array<{ from: string; to: string }> = [];
    for (
      let from = calendarStart, to = calendarEnd;
      from <= targetEnd;
      from = addCalendarDays(to, 1), to = addCalendarDays(to, 90)
    ) {
      windows.push({ from, to: to > targetEnd ? targetEnd : to });
    }
    Promise.all(windows.map(({ from, to }) => requestCalendar(listingId, from, to)))
      .then((responses) => {
        if (!isMounted) return;
        const days = responses.flat();
        if (
          isRefresh &&
          (days.length === 0 || contiguousCoverageEnd(days, calendarStart, targetEnd) !== targetEnd)
        ) {
          incompleteInitialWindowRef.current = true;
          throw new Error('Calendar refresh has unconfirmed dates');
        }
        const expirations = responses
          .map(getCalendarExpiration)
          .filter((value): value is number => value !== undefined);
        const expiresAt = expirations.length ? Math.min(...expirations) : null;

        setCalendarDays(days);
        setCalendarExpiresAt(expiresAt);
        setCalendarAvailable(days.length > 0);
        setCalendarCoverageEnd(days.length > 0 ? targetEnd : '');
        if (
          days.length > 0 &&
          contiguousCoverageEnd(days, calendarStart, targetEnd) !== targetEnd
        ) {
          incompleteInitialWindowRef.current = true;
          setCalendarExtensionMessage(
            'Algumas datas ainda não têm disponibilidade confirmada. Tente novamente.',
          );
        }
        setIsLoadingCalendar(false);
        setIsRefreshingCalendar(false);
        setCalendarMessage(
          days.length > 0
            ? ''
            : 'Não foi possível confirmar a disponibilidade. Tente novamente mais tarde.',
        );
      })
      .catch(() => {
        if (!isMounted) return;
        if (!isRefresh) setCalendarDays([]);
        setCalendarAvailable(false);
        setIsLoadingCalendar(false);
        setIsRefreshingCalendar(false);
        setCalendarMessage(
          'Não foi possível confirmar a disponibilidade. Tente novamente mais tarde.',
        );
      });

    return () => {
      isMounted = false;
    };
  }, [listingId, todayIso, calendarRefreshToken, requestedCalendarContextKey]);

  useEffect(() => {
    if (calendarExpiresAt === null) return;
    const timeout = window.setTimeout(
      () => {
        setCalendarAvailable(false);
        setCalendarRefreshToken((token) => token + 1);
      },
      Math.max(0, calendarExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [calendarExpiresAt]);

  const loadCalendarThrough = useCallback(
    async (targetDate: string) => {
      if (!Number.isFinite(new Date(`${targetDate}T12:00:00`).getTime())) return;
      const contextKey = requestedCalendarContextKey;
      const generation = calendarGenerationRef.current;
      extensionTargetRef.current = { contextKey, targetDate };
      if (
        !listingId ||
        isLoadingCalendar ||
        isRefreshingCalendar ||
        failedExtensionContextRef.current === contextKey ||
        !calendarCoverageEnd ||
        targetDate <= calendarCoverageEnd ||
        extensionInFlightContextKeyRef.current === contextKey
      ) {
        return;
      }

      extensionInFlightContextKeyRef.current = contextKey;
      setIsExtendingCalendar(true);
      setCalendarExtensionMessage('Consultando disponibilidade deste mês...');

      try {
        let nextStart = new Date(`${calendarCoverageEnd}T12:00:00`);
        nextStart.setDate(nextStart.getDate() + 1);
        let mergedDays = calendarDays;
        let coverageEnd = calendarCoverageEnd;

        while (
          coverageEnd <
          (extensionTargetRef.current?.contextKey === contextKey
            ? extensionTargetRef.current.targetDate
            : targetDate)
        ) {
          const chunkEnd = new Date(`${coverageEnd}T12:00:00`);
          chunkEnd.setDate(chunkEnd.getDate() + 90);
          const requestedEnd = chunkEnd.toISOString().slice(0, 10);
          const days = await requestCalendar(
            listingId,
            nextStart.toISOString().slice(0, 10),
            requestedEnd,
          );

          if (
            latestCalendarContextKeyRef.current !== contextKey ||
            calendarGenerationRef.current !== generation
          )
            return;
          if (days.length === 0) {
            throw new Error('Calendar extension returned no availability data');
          }

          const extensionExpiry = getCalendarExpiration(days);
          if (extensionExpiry !== undefined) {
            setCalendarExpiresAt((current) =>
              current === null ? extensionExpiry : Math.min(current, extensionExpiry),
            );
          }
          const mergedByDate = new Map(mergedDays.map((day) => [day.date, day]));
          days.forEach((day) => mergedByDate.set(day.date, day));
          mergedDays = [...mergedByDate.values()].sort((first, second) =>
            first.date.localeCompare(second.date),
          );
          const confirmedEnd = contiguousCoverageEnd(
            days,
            nextStart.toISOString().slice(0, 10),
            requestedEnd,
          );
          if (confirmedEnd !== requestedEnd) {
            setCalendarDays(mergedDays);
            throw new Error('Calendar extension has unconfirmed dates');
          }
          coverageEnd = confirmedEnd;
          nextStart = new Date(`${coverageEnd}T12:00:00`);
          nextStart.setDate(nextStart.getDate() + 1);
          setCalendarDays(mergedDays);
          setCalendarCoverageEnd(coverageEnd);
        }

        setCalendarExtensionMessage('');
      } catch {
        if (
          latestCalendarContextKeyRef.current === contextKey &&
          calendarGenerationRef.current === generation
        ) {
          failedExtensionContextRef.current = contextKey;
          setCalendarExtensionMessage('Não foi possível consultar este mês. Tente novamente.');
        }
      } finally {
        if (
          extensionInFlightContextKeyRef.current === contextKey &&
          calendarGenerationRef.current === generation
        ) {
          extensionInFlightContextKeyRef.current = '';
        }
        if (
          latestCalendarContextKeyRef.current === contextKey &&
          calendarGenerationRef.current === generation
        )
          setIsExtendingCalendar(false);
      }
    },
    [
      calendarCoverageEnd,
      calendarDays,
      listingId,
      isLoadingCalendar,
      isRefreshingCalendar,
      requestedCalendarContextKey,
    ],
  );

  useEffect(() => {
    const target = extensionTargetRef.current;
    if (calendarExtensionToken > 0 && target?.contextKey === requestedCalendarContextKey) {
      void loadCalendarThrough(target.targetDate);
    }
  }, [calendarExtensionToken, loadCalendarThrough, requestedCalendarContextKey]);

  const hasCurrentCalendarContext = Boolean(
    property && calendarContextKey === requestedCalendarContextKey,
  );

  return {
    ...quote,
    calendarDays: hasCurrentCalendarContext ? calendarDays : [],
    calendarCoverageEnd: hasCurrentCalendarContext ? calendarCoverageEnd : '',
    isExtendingCalendar: hasCurrentCalendarContext && isExtendingCalendar,
    calendarExtensionMessage: hasCurrentCalendarContext ? calendarExtensionMessage : '',
    loadCalendarThrough,
    retryCalendarExtension: () => {
      failedExtensionContextRef.current = '';
      if (incompleteInitialWindowRef.current) setCalendarRefreshToken((token) => token + 1);
      else if (extensionTargetRef.current) setCalendarExtensionToken((token) => token + 1);
      else setCalendarRefreshToken((token) => token + 1);
    },
    calendarAvailable:
      hasCurrentCalendarContext &&
      calendarAvailable &&
      (calendarExpiresAt === null || calendarExpiresAt > Date.now()),
    calendarMessage: hasCurrentCalendarContext
      ? calendarMessage
      : property
        ? 'Atualizando disponibilidade...'
        : '',
    isLoadingCalendar: Boolean(property && (!hasCurrentCalendarContext || isLoadingCalendar)),
    isRefreshingCalendar: hasCurrentCalendarContext && isRefreshingCalendar,
    revalidateCalendar: () => {
      if (!calendarAvailable || (calendarExpiresAt !== null && calendarExpiresAt <= Date.now())) {
        setCalendarRefreshToken((token) => token + 1);
      }
    },
    retryCalendar: () => setCalendarRefreshToken((token) => token + 1),
  };
}
