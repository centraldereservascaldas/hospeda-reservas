import { DatabaseSync } from 'node:sqlite';

/** Sandbox tracking only; stores no guest identity, gateway credentials or card data. */
export function openSandboxOrderStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS sandbox_orders (
    id TEXT PRIMARY KEY, reservation_reference TEXT NOT NULL,
    property_id TEXT NOT NULL, check_in TEXT NOT NULL, check_out TEXT NOT NULL,
    guests INTEGER NOT NULL, amount_cents INTEGER NOT NULL, payment_method TEXT NOT NULL,
    payment_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('awaiting_seller_confirmation','confirmed')),
    confirmed_by TEXT, updated_at TEXT NOT NULL
  )`);
  return {
    recordPaid(input) {
      if (!input || input.simulation !== true || input.paymentVerified !== true || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id||'') || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.reservationReference||'') || !/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/.test(input.propertyId||'') || !/^\d{4}-\d{2}-\d{2}$/.test(input.from||'') || !/^\d{4}-\d{2}-\d{2}$/.test(input.to||'') || input.from>=input.to || !Number.isInteger(input.guests) || input.guests<1 || !Number.isSafeInteger(input.amountCents) || input.amountCents<1 || !['pix','card'].includes(input.method) || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.paymentId||'')) throw new Error('Pedido simulado inválido.');
      db.prepare(`INSERT INTO sandbox_orders (id,reservation_reference,property_id,check_in,check_out,guests,amount_cents,payment_method,payment_id,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'awaiting_seller_confirmation',?)`).run(input.id,input.reservationReference,input.propertyId,input.from,input.to,input.guests,input.amountCents,input.method,input.paymentId,new Date().toISOString());
    },
    listPending() { return db.prepare("SELECT id,reservation_reference,property_id,check_in,check_out,guests,amount_cents,payment_method,status,updated_at FROM sandbox_orders WHERE status='awaiting_seller_confirmation' ORDER BY updated_at,id").all(); },
    confirm(id, operator) {
      if (typeof operator!=='string' || !operator.trim() || operator.length>100) throw new Error('Operador necessário.');
      const result=db.prepare("UPDATE sandbox_orders SET status='confirmed',confirmed_by=?,updated_at=? WHERE id=? AND status='awaiting_seller_confirmation'").run(operator.trim(),new Date().toISOString(),id);
      if (result.changes!==1) throw new Error('Pedido não está pendente.');
    },
    close() { db.close(); },
  };
}
