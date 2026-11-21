import { DatabaseSync } from 'node:sqlite';
export function openCheckoutOperationStore(path) {
 const db=new DatabaseSync(path);
 db.exec('CREATE TABLE IF NOT EXISTS checkout_operations(id TEXT PRIMARY KEY, state TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
 return {
  claim(id,payload){db.prepare('INSERT INTO checkout_operations(id,state,payload,updated_at) VALUES (?,?,?,?)').run(id,'reservation_starting',JSON.stringify(payload),new Date().toISOString());},
  advance(id,state,payload){const previous=db.prepare('SELECT payload FROM checkout_operations WHERE id=?').get(id);if(!previous)throw Error('Pedido não registrado.');db.prepare('UPDATE checkout_operations SET state=?,payload=?,updated_at=? WHERE id=?').run(state,JSON.stringify({...JSON.parse(previous.payload),...payload}),new Date().toISOString(),id);},
  get(id){const row=db.prepare('SELECT * FROM checkout_operations WHERE id=?').get(id);return row?{...row,payload:JSON.parse(row.payload)}:null;},
  close(){db.close();},
 };
}
