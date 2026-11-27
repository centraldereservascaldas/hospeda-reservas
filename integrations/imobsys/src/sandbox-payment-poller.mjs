/** Requeries pending sandbox payments sequentially; reservation claims prevent duplicates. */
export function createSandboxPaymentPoller({ operations, reconcile }) {
  let running = false;
  let cursor = '';
  return async function poll() {
    if (running) return;
    running = true;
    try {
      const ids = operations.listPaymentPending(50, cursor);
      if (ids.length === 0) { cursor = ''; return; }
      for (const id of ids) {
        try { await reconcile(id); } catch { /* pending, unavailable or flagged for review */ }
        cursor = id;
      }
      if (ids.length < 50) cursor = '';
    } finally { running = false; }
  };
}
