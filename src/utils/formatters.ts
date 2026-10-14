import { Currency } from '../types';

export const formatCurrency = (amount: number, currency: Currency = 'BRL'): string => {
  const rates: Record<Currency, { locale: string; code: string; factor: number }> = {
    BRL: { locale: 'pt-BR', code: 'BRL', factor: 1 },
    USD: { locale: 'en-US', code: 'USD', factor: 0.18 },
    EUR: { locale: 'de-DE', code: 'EUR', factor: 0.16 },
  };

  const config = rates[currency] || rates.BRL;
  const converted = amount * config.factor;

  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);
};

export const calculateNights = (checkInStr: string, checkOutStr: string): number => {
  if (!checkInStr || !checkOutStr) return 1;
  const start = new Date(checkInStr);
  const end = new Date(checkOutStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1;
};

export const formatDateRange = (checkInStr: string, checkOutStr: string): string => {
  if (!checkInStr || !checkOutStr) return 'Datas flexíveis';
  const start = new Date(checkInStr);
  const end = new Date(checkOutStr);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthNames = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'
  ];
  const startMonth = monthNames[start.getMonth()];
  const endMonth = monthNames[end.getMonth()];

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} de ${startMonth}`;
  }
  return `${startDay} de ${startMonth} - ${endDay} de ${endMonth}`;
};

export const generateBookingCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'HOSP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
