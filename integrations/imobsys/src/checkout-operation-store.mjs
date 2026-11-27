import { DatabaseSync } from 'node:sqlite';
export function openCheckoutOperationStore(path) {
 const db=new DatabaseSync(path);
 db.exec('CREATE TABLE IF NOT EXISTS checkout_operations(id TEXT PRIMARY KEY, state TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
 return {
  claim(id,payload){db.prepare('INSERT INTO checkout_operations(id,state,payload,updated_at) VALUES (?,?,?,?)').run(id,'payment_starting',JSON.stringify(payload),new Date().toISOString());},
  advance(id,state,payload){const previous=db.prepare('SELECT payload FROM checkout_operations WHERE id=?').get(id);if(!previous)throw Error('Pedido não registrado.');db.prepare('UPDATE checkout_operations SET state=?,payload=?,updated_at=? WHERE id=?').run(state,JSON.stringify({...JSON.parse(previous.payload),...payload}),new Date().toISOString(),id);},
  claimTransition(id,expected,next){
   const result=db.prepare('UPDATE checkout_operations SET state=?,updated_at=? WHERE id=? AND state=?').run(next,new Date().toISOString(),id,expected);
   return result.changes===1;
  },
  get(id){const row=db.prepare('SELECT * FROM checkout_operations WHERE id=?').get(id);return row?{...row,payload:JSON.parse(row.payload)}:null;},
  listPaymentPending(limit=50,after=''){if(!Number.isInteger(limit)||limit<1||limit>100||typeof after!=='string')throw Error('Limite inválido.');return db.prepare("SELECT id FROM checkout_operations WHERE state='payment_pending' AND id>? ORDER BY id LIMIT ?").all(after,limit).map(row=>row.id);},
  listAttention(){return db.prepare("SELECT id,state,payload,updated_at FROM checkout_operations WHERE state IN ('attention_required','payment_starting','reservation_starting','reservation_returned') ORDER BY updated_at,id").all().map(row=>{const payload=JSON.parse(row.payload),order=payload.order||{};return {id:row.id,state:row.state,reason:payload.reason||'operation_requires_review',property_id:order.propertyId||null,check_in:order.from||null,check_out:order.to||null,amount_cents:order.amountCents||null,payment_method:order.method||null,reservation_reference:payload.reference||null,updated_at:row.updated_at};});},
  close(){db.close();},
 };
}
