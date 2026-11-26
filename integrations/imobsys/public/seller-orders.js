const form = document.getElementById('access'), list = document.getElementById('orders'), status = document.getElementById('status');
function field(form, label, type) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const input = document.createElement('input'); input.type = type; input.required = true; input.autocomplete = 'off'; wrapper.append(input); form.append(wrapper); return input;
}
form.addEventListener('submit', async event => {
  event.preventDefault(); list.replaceChildren(); status.textContent = 'Consultando…';
  const key = document.getElementById('access-key');
  try {
    const response = await fetch('/internal/seller/orders', { headers: { 'x-local-control': key.value }, cache: 'no-store' });
    if (!response.ok) throw Error('Acesso ou consulta indisponível.');
    const data = await response.json();
    if (data.environment !== 'sandbox' || !Array.isArray(data.orders) || !Array.isArray(data.attention)) throw Error('Resposta inválida.');
    status.textContent = `${data.orders.length} pedido(s) pendente(s) e ${data.attention.length} para conferência (sandbox).`;
    for (const order of data.orders) {
      const article = document.createElement('article');
      const details = document.createElement('p');
      details.textContent = `Pré-reserva ${order.reservation_reference} · ${order.property_id} · ${order.check_in} a ${order.check_out} · ${order.payment_method} · recebido: R$ ${(order.amount_cents / 100).toFixed(2)} · cotação: ${Number.isSafeInteger(order.supplier_amount_cents) ? `R$ ${(order.supplier_amount_cents / 100).toFixed(2)}` : 'não informada'}. Confira o valor na ImobSys.`;
      article.append(details);
      const paymentForm = document.createElement('form');
      const operator = field(paymentForm, 'Responsável', 'text'), amount = field(paymentForm, 'Valor pago em reais', 'number'), reference = field(paymentForm, 'Referência do pagamento', 'text'), access = field(paymentForm, 'Chave de acesso local', 'password');
      amount.min = '0.01'; amount.step = '0.01';
      const button = document.createElement('button'); button.textContent = 'Registrar pagamento manual de teste'; paymentForm.append(button);
      paymentForm.addEventListener('submit', async e => {
        e.preventDefault(); button.disabled = true;
        try {
          const cents = Math.round(Number(amount.value) * 100);
          const result = await fetch('/internal/checkout/seller-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-local-control': access.value }, body: JSON.stringify({ id: order.id, operator: operator.value, amountCents: cents, reference: reference.value }) });
          if (!result.ok) throw Error('Não foi possível registrar. Confira os dados e consulte novamente.');
          article.textContent = `Pagamento de teste registrado para a pré-reserva ${order.reservation_reference}.`;
        } catch (error) { status.textContent = error.message; button.disabled = false; }
        finally { access.value = ''; }
      });
      article.append(paymentForm); list.append(article);
    }
    for (const order of data.attention) { const article = document.createElement('article'); article.textContent = `Atenção: pedido ${order.id} · ${order.property_id || 'imóvel não informado'} · ${order.check_in || '?'} a ${order.check_out || '?'} · confira pagamento e pré-reserva antes de repetir`; list.append(article); }
  } catch (error) { status.textContent = error.message; }
  finally { key.value = ''; }
});
