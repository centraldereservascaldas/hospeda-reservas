import { useCallback, useEffect, useRef, useState } from 'react';
import type { Property } from '../../types';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import type { StaysCalendarDay } from '../../utils/staysAvailability';

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
  const [isExtendingCalendar, setIsExtendingCalendar] = useState(false);
  const [calendarExtensionMessage, setCalendarExtensionMessage] = useState('');
  const [calendarExtensionToken, setCalendarExtensionToken] = useState(0);
  const extensionInFlightContextKeyRef = useRef('');
  const latestCalendarContextKeyRef = useRef('');
  const extensionTargetRef = useRef<{ contextKey: string; targetDate: string } | null>(null);
  const [calendarContextKey, setCalendarContextKey] = useState('');
  const [priceRefreshToken, setPriceRefreshToken] = useState(0);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [priceRequestFailed, setPriceRequestFailed] = useState(false);
  const [priceContextKey, setPriceContextKey] = useState('');
  const requestedCalendarContextKey = property
    ? JSON.stringify([property.id, property.staysListingId || property.id, checkIn || todayIso])
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
    const calendarStart = checkIn || todayIso;
    const calendarEnd = new Date(new Date(`${calendarStart}T12:00:00`).getTime() + 90 * 86400000)
      .toISOString()
      .slice(0, 10);

    setCalendarAvailable(false);
    setCalendarMessage('Atualizando disponibilidade...');
    setIsLoadingCalendar(true);
    setCalendarDays([]);
    setCalendarCoverageEnd('');
    extensionTargetRef.current = null;
    setCalendarExtensionMessage('');
    setIsExtendingCalendar(false);
    setCalendarContextKey(requestedCalendarContextKey);
    crcnBackendApi
      .getAccommodationCalendar(property.staysListingId || property.id, calendarStart, calendarEnd)
      .then((days) => {
        if (!isMounted) return;
        setCalendarDays(days);
        setCalendarAvailable(days.length > 0);
        setCalendarCoverageEnd(days.length > 0 ? calendarEnd : '');
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
  }, [property, checkIn, todayIso, calendarRefreshToken, requestedCalendarContextKey]);

  const loadCalendarThrough = useCallback(
    async (targetDate: string) => {
      if (!Number.isFinite(new Date(`${targetDate}T12:00:00`).getTime())) return;
      const contextKey = requestedCalendarContextKey;
      extensionTargetRef.current = { contextKey, targetDate };
      if (
        !property ||
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
          const days = await crcnBackendApi.getAccommodationCalendar(
            listingId,
            nextStart.toISOString().slice(0, 10),
            requestedEnd,
          );

          if (latestCalendarContextKeyRef.current !== contextKey) return;
          if (days.length === 0) {
            throw new Error('Calendar extension returned no availability data');
          }

          const mergedByDate = new Map(mergedDays.map((day) => [day.date, day]));
          days.forEach((day) => mergedByDate.set(day.date, day));
          mergedDays = [...mergedByDate.values()].sort((first, second) =>
            first.date.localeCompare(second.date),
          );
          coverageEnd = requestedEnd;
          nextStart = new Date(`${coverageEnd}T12:00:00`);
          nextStart.setDate(nextStart.getDate() + 1);
          setCalendarDays(mergedDays);
          setCalendarCoverageEnd(coverageEnd);
        }

        setCalendarExtensionMessage('');
      } catch {
        if (latestCalendarContextKeyRef.current === contextKey) {
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
    retryCalendarExtension: () => setCalendarExtensionToken((token) => token + 1),
    calendarAvailable: hasCurrentCalendarContext && calendarAvailable,
    calendarMessage: hasCurrentCalendarContext
      ? calendarMessage
      : property
        ? 'Atualizando disponibilidade...'
        : '',
    isLoadingCalendar: Boolean(property && (!hasCurrentCalendarContext || isLoadingCalendar)),
    retryCalendar: () => setCalendarRefreshToken((token) => token + 1),
    retryPrice: () => setPriceRefreshToken((token) => token + 1),
    isCalculatingPrice: Boolean(property && (!hasCurrentPriceContext || isCalculatingPrice)),
    priceRequestFailed: hasCurrentPriceContext && priceRequestFailed,
  };
}
