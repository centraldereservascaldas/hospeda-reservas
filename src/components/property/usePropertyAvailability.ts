import { useCallback, useEffect, useRef, useState } from 'react';
import type { Property } from '../../types';
import { crcnBackendApi, getCalendarExpiration } from '../../services/crcnBackendApi';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
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
  const [staysPrice, setStaysPrice] = useState<CalculatedPriceResponse | null>(null);
  const [calendarDays, setCalendarDays] = useState<StaysCalendarDay[]>([]);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [calendarCoverageEnd, setCalendarCoverageEnd] = useState('');
  const [calendarExpiresAt, setCalendarExpiresAt] = useState<number | null>(null);
  const incompleteInitialWindowRef = useRef(false);
  const [isExtendingCalendar, setIsExtendingCalendar] = useState(false);
  const [calendarExtensionMessage, setCalendarExtensionMessage] = useState('');
  const [calendarExtensionToken, setCalendarExtensionToken] = useState(0);
  const extensionInFlightContextKeyRef = useRef('');
  const failedExtensionContextRef = useRef('');
  const latestCalendarContextKeyRef = useRef('');
  const extensionTargetRef = useRef<{ contextKey: string; targetDate: string } | null>(null);
  const [calendarContextKey, setCalendarContextKey] = useState('');
  const [priceRefreshToken, setPriceRefreshToken] = useState(0);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [priceRequestFailed, setPriceRequestFailed] = useState(false);
  const [priceContextKey, setPriceContextKey] = useState('');
  const requestedCalendarContextKey = property
    ? JSON.stringify([property.id, property.staysListingId || property.id, todayIso])
    : '';
  useEffect(() => {
    latestCalendarContextKeyRef.current = requestedCalendarContextKey;
  }, [requestedCalendarContextKey]);
  const requestedPriceContextKey = property
    ? JSON.stringify([
        property.id,
        property.staysListingId || property.id,
        checkIn,
        checkOut,
        guests,
      ])
    : '';

  useEffect(() => {
    if (!property) {
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

    setCalendarExpiresAt(null);
    incompleteInitialWindowRef.current = false;
    setCalendarAvailable(false);
    setCalendarMessage('Atualizando disponibilidade...');
    setIsLoadingCalendar(true);
    setCalendarDays([]);
    setCalendarCoverageEnd('');
    extensionTargetRef.current = null;
    failedExtensionContextRef.current = '';
    setCalendarExtensionMessage('');
    setIsExtendingCalendar(false);
    setCalendarContextKey(requestedCalendarContextKey);
    requestCalendar(property.staysListingId || property.id, calendarStart, calendarEnd)
      .then((days) => {
        if (!isMounted) return;
        setCalendarDays(days);
        setCalendarExpiresAt(getCalendarExpiration(days) ?? null);
        setCalendarAvailable(days.length > 0);
        setCalendarCoverageEnd(days.length > 0 ? calendarEnd : '');
        if (
          days.length > 0 &&
          contiguousCoverageEnd(days, calendarStart, calendarEnd) !== calendarEnd
        ) {
          incompleteInitialWindowRef.current = true;
          setCalendarExtensionMessage(
            'Algumas datas ainda não têm disponibilidade confirmada. Tente novamente.',
          );
        }
        setIsLoadingCalendar(false);
        setCalendarMessage(
          days.length > 0
            ? ''
            : 'Não foi possível confirmar a disponibilidade. Tente novamente mais tarde.',
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setCalendarDays([]);
        setCalendarAvailable(false);
        setIsLoadingCalendar(false);
        setCalendarMessage(
          'Não foi possível confirmar a disponibilidade. Tente novamente mais tarde.',
        );
      });

    return () => {
      isMounted = false;
    };
  }, [property, todayIso, calendarRefreshToken, requestedCalendarContextKey]);

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
      extensionTargetRef.current = { contextKey, targetDate };
      if (
        !property ||
        failedExtensionContextRef.current === contextKey ||
        !calendarCoverageEnd ||
        targetDate <= calendarCoverageEnd ||
        extensionInFlightContextKeyRef.current === contextKey
      ) {
        return;
      }

      const listingId = property.staysListingId || property.id;
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

          if (latestCalendarContextKeyRef.current !== contextKey) return;
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
        if (latestCalendarContextKeyRef.current === contextKey) {
          failedExtensionContextRef.current = contextKey;
          setCalendarExtensionMessage('Não foi possível consultar este mês. Tente novamente.');
        }
      } finally {
        if (extensionInFlightContextKeyRef.current === contextKey) {
          extensionInFlightContextKeyRef.current = '';
        }
        if (latestCalendarContextKeyRef.current === contextKey) setIsExtendingCalendar(false);
      }
    },
    [calendarCoverageEnd, calendarDays, property, requestedCalendarContextKey],
  );

  useEffect(() => {
    const target = extensionTargetRef.current;
    if (calendarExtensionToken > 0 && target?.contextKey === requestedCalendarContextKey) {
      void loadCalendarThrough(target.targetDate);
    }
  }, [calendarExtensionToken, loadCalendarThrough, requestedCalendarContextKey]);

  useEffect(() => {
    if (!property || !checkIn || !checkOut) {
      setStaysPrice(null);
      setIsCalculatingPrice(false);
      setPriceRequestFailed(false);
      setPriceContextKey(requestedPriceContextKey);
      return;
    }

    let isMounted = true;
    setIsCalculatingPrice(true);
    setStaysPrice(null);
    setPriceRequestFailed(false);
    setPriceContextKey(requestedPriceContextKey);
    crcnBackendApi
      .calculatePrice({
        listingId: property.staysListingId || property.id,
        from: checkIn,
        to: checkOut,
        guests,
      })
      .then((response) => {
        if (!isMounted) return;
        setStaysPrice(response);
        setIsCalculatingPrice(false);
      })
      .catch(() => {
        if (isMounted) {
          setIsCalculatingPrice(false);
          setPriceRequestFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [property, checkIn, checkOut, guests, priceRefreshToken, requestedPriceContextKey]);

  const hasCurrentCalendarContext = Boolean(
    property && calendarContextKey === requestedCalendarContextKey,
  );
  const hasCurrentPriceContext = Boolean(property && priceContextKey === requestedPriceContextKey);

  return {
    staysPrice: hasCurrentPriceContext ? staysPrice : null,
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
    revalidateCalendar: () => setCalendarRefreshToken((token) => token + 1),
    retryCalendar: () => setCalendarRefreshToken((token) => token + 1),
    retryPrice: () => setPriceRefreshToken((token) => token + 1),
    isCalculatingPrice: Boolean(property && (!hasCurrentPriceContext || isCalculatingPrice)),
    priceRequestFailed: hasCurrentPriceContext && priceRequestFailed,
  };
}
