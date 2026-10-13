import { useEffect, useState } from 'react';
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
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  useEffect(() => {
    if (!property) {
      setCalendarDays([]);
      setCalendarAvailable(false);
      setCalendarMessage('');
      setIsLoadingCalendar(false);
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
    crcnBackendApi
      .getAccommodationCalendar(property.staysListingId || property.id, calendarStart, calendarEnd)
      .then((days) => {
        if (!isMounted) return;
        setCalendarDays(days);
        setCalendarAvailable(days.length > 0);
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
  }, [property, checkIn, todayIso]);

  useEffect(() => {
    if (!property) {
      setStaysPrice(null);
      setIsCalculatingPrice(false);
      return;
    }

    let isMounted = true;
    setIsCalculatingPrice(true);
    setStaysPrice(null);
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
        if (isMounted) setIsCalculatingPrice(false);
      });

    return () => {
      isMounted = false;
    };
  }, [property, checkIn, checkOut, guests]);

  return {
    staysPrice,
    calendarDays,
    calendarAvailable,
    calendarMessage,
    isLoadingCalendar,
    isCalculatingPrice,
  };
}
