const byId = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
let properties = [];

function renderProperties() {
  const selected = byId('property').value;
  const search = byId('property-search').value.trim().toLocaleLowerCase('pt-BR');
  byId('property').replaceChildren();
  for (const property of properties.filter((item) => `${item.title} ${item.id}`.toLocaleLowerCase('pt-BR').includes(search))) {
    const option = document.createElement('option');
    option.value = property.id;
    option.textContent = `${property.title} · base ${property.base}`;
    option.selected = property.id === selected;
    byId('property').append(option);
  }
}

async function read(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || 'Não foi possível concluir a consulta.');
  return data;
}

function showResponse(data) {
  byId('response').textContent = JSON.stringify(data, null, 2);
  byId('response-box').hidden = false;
}

async function initialize() {
  try {
    const data = await read('/api/properties');
    properties = data.properties;
    renderProperties();
    byId('property-count').textContent = String(properties.length);
    byId('base-count').textContent = String(new Set(properties.map((property) => property.base)).size);
    const { catalog } = await read('/api/catalog');
    byId('condominium-count').textContent = String(catalog.condominiums.length);
    byId('catalog-status').textContent = catalog.updatedAt ? `Snapshot de ${new Date(catalog.updatedAt).toLocaleString('pt-BR')}. ${catalog.scans.filter((scan) => scan.success).length} períodos consultados.` : 'Ainda não há snapshot de descoberta. Execute o mapeamento local.';
    const date = (offset) => {
      const value = new Date();
      value.setDate(value.getDate() + offset);
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    };
    byId('from').min = date(0);
    byId('to').min = date(1);
    byId('from').value = date(9);
    byId('to').value = date(11);
    byId('calendar-month').value = date(0).slice(0, 7);
    const admin = await read('/api/admin/status');
    byId('admin-status').textContent = admin.browser?.connected ? 'Executor do painel conectado. Consultas de leitura disponíveis.' : 'Entre na janela isolada da ImobSys para conectar as consultas ao vivo. A prévia usa os períodos já consultados.';
    try { const integration=await read('/api/integration/status');const c=integration.coverage;byId('integration-status').textContent=`${c.references} referências · ${c.withUnitPhotos} com fotos de unidade · ${c.rollingQueriesSucceeded} consultas de entrada concluídas. Integração com produção desativada.`; } catch { byId('integration-status').textContent='O pacote de integração ainda não foi gerado.'; }
  } catch { byId('message').textContent = 'Não foi possível carregar a configuração local.'; }
}

byId('quote-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  byId('quote-button').disabled = true;
  byId('amounts').hidden = true;
  byId('warning').hidden = true;
  byId('response-box').hidden = true;
  byId('message').textContent = 'Consultando os preços anunciados pelo fornecedor…';
  try {
    const query = new URLSearchParams({ from: byId('from').value, to: byId('to').value });
    const data = await read(`/api/properties/${encodeURIComponent(byId('property').value)}/quote?${query}`);
    byId('pix').textContent = money(data.quote.pixCents);
    byId('card').textContent = money(data.quote.cardCents);
    byId('deposit').textContent = money(data.quote.depositCents);
    byId('amounts').hidden = false;
    byId('warning').hidden = false;
    byId('message').textContent = `${data.quote.nights} noite(s). Valores do fornecedor, sem aplicar nossas taxas.`;
    showResponse(data);
  } catch (error) { byId('message').textContent = error.message; }
  finally { byId('quote-button').disabled = false; }
});

byId('property-search').addEventListener('input', renderProperties);

byId('availability-button').addEventListener('click', async () => {
  if (!byId('quote-form').reportValidity()) return;
  byId('availability-button').disabled = true;
  byId('amounts').hidden = true;
  byId('warning').hidden = true;
  byId('response-box').hidden = true;
  byId('message').textContent = 'Consultando se o fornecedor oferece esta referência para o período…';
  try {
    const query = new URLSearchParams({ from: byId('from').value, to: byId('to').value, propertyId: byId('property').value });
    const data = await read(`/api/availability?${query}`);
    byId('message').textContent = data.result.status === 'offered-by-supplier' ? 'Oferta localizada para o período. Estoque ainda não confirmado ou bloqueado.' : 'Oferta não localizada neste período. Isso não comprova indisponibilidade.';
    showResponse(data);
  } catch (error) { byId('message').textContent = error.message; }
  finally { byId('availability-button').disabled = false; }
});

byId('calendar-button').addEventListener('click', async () => {
  byId('calendar-button').disabled = true;
  byId('calendar-status').textContent = 'Consultando as unidades expostas pelo mapa mensal…';
  try {
    const data = await read(`/api/calendar?${new URLSearchParams({ month: byId('calendar-month').value })}`);
    byId('calendar-status').textContent = `${data.calendar.count} unidades no mapa público. Marcações coletadas; disponibilidade final desconhecida.`;
    showResponse(data);
  } catch (error) { byId('calendar-status').textContent = error.message; }
  finally { byId('calendar-button').disabled = false; }
});

byId('details-button').addEventListener('click', async () => {
  byId('details-button').disabled = true;
  byId('message').textContent = 'Consultando a página pública do imóvel…';
  try {
    const data = await read(`/api/properties/${encodeURIComponent(byId('property').value)}/details`);
    showResponse(data);
    byId('message').textContent = `Identificação retornada: ${data.property.title}`;
  } catch (error) { byId('message').textContent = error.message; }
  finally { byId('details-button').disabled = false; }
});

byId('status-button').addEventListener('click', async () => {
  byId('status-button').disabled = true;
  byId('provider-status').textContent = 'Conferindo a autenticação, sem executar ações da API…';
  try {
    const { provider } = await read('/api/provider/status');
    byId('provider-status').textContent = !provider.configured ? 'Credencial CNSP não configurada no .env local.'
      : provider.authenticated ? 'Autenticação aceita. As ações da API externa ainda precisam ser mapeadas.'
        : 'A resposta não confirmou a autenticação. Confira a configuração local.';
  } catch (error) { byId('provider-status').textContent = error.message; }
  finally { byId('status-button').disabled = false; }
});

byId('admin-button').addEventListener('click', async () => {
  byId('admin-button').disabled = true;
  byId('admin-status').textContent = 'Consultando a rede pelo painel, sem reservar…';
  try {
    const params = new URLSearchParams({from:byId('from').value,to:byId('to').value,unit:byId('admin-unit').value.trim(),guests:byId('admin-guests').value});
    const data = await read(`/api/admin/availability?${params}`);
    byId('admin-status').textContent = data.result.status === 'restricted'
      ? data.result.restrictions.map(r=>`${r.supplier}: mínimo de ${r.minimumNights} noites`).join(' · ')
      : `${data.result.count} ofertas encontradas no painel. Ausência não confirma ocupação; nenhuma data foi bloqueada.`;
    showResponse(data);
  } catch (error) { byId('admin-status').textContent = error.message; }
  finally { byId('admin-button').disabled = false; }
});
void initialize();
