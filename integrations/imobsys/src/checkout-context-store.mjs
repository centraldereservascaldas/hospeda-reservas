import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// The key must be provided by the server's secret manager and remain stable across restarts.
export function openCheckoutContextStore(path, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Chave de contexto inválida.');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS checkout_contexts (id TEXT PRIMARY KEY, payload BLOB NOT NULL)');
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9]{1,25}$/.test(id);
  return {
    save(id, context) {
      if (!validId(id) || !context || typeof context !== 'object') throw new Error('Contexto inválido.');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(id));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(context), 'utf8'), cipher.final()]);
      db.prepare('INSERT INTO checkout_contexts (id,payload) VALUES (?,?)').run(id, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
    },
    load(id) {
      if (!validId(id)) throw new Error('Pedido inválido.');
      const row = db.prepare('SELECT payload FROM checkout_contexts WHERE id=?').get(id);
      if (!row) return null;
      const data = Buffer.from(row.payload);
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
    },
    remove(id) { if (!validId(id)) throw new Error('Pedido inválido.'); db.prepare('DELETE FROM checkout_contexts WHERE id=?').run(id); },
    close() { db.close(); },
  };
}
