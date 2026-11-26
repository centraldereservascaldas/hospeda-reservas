import { ConnectorError, validateDates } from './provider-http.mjs';

// The panel returns personal and financial data. Return only the fields
// necessary for identifying a reservation; never echo the untrusted row.
export function normalizeReservationRows(rows, query) {
  const { from, to } = validateDates(query.from, query.to);
  if (!Array.isArray(rows) || rows.length > 2000) throw new ConnectorError('invalid_reservations', 'Resposta de reservas inválida.', 502);
  const seen = new Set();
  const data = rows.map(row => {
    if (!row || !/^[1-9]\d{0,11}$/.test(row.id || '') || typeof row.unit !== 'string' || row.unit.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(row.checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(row.checkOut || '') || row.checkIn >= row.checkOut || seen.has(row.id)) throw new ConnectorError('invalid_reservations', 'Reserva não pôde ser validada.', 502);
    seen.add(row.id);
    return { id: row.id, unit: row.unit, checkIn: row.checkIn, checkOut: row.checkOut };
  });
  return { success: true, source: 'imobsys-panel', from, to, data, count: data.length, complete: false };
}
