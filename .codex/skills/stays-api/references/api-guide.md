# Stays External API — guia CRCN

Este documento resume a API externa da Stays configurada para a CRCN. O contrato completo da conta está em [stays-openapi.json](stays-openapi.json), no formato OpenAPI 3.0.3. Consulte esse arquivo para parâmetros, schemas e respostas exatos de cada operação.

A especificação contém **202 operações em 123 caminhos**, com **225 schemas** reutilizáveis. Ela descreve parâmetros de rota/query, corpos de requisição e códigos e schemas de resposta. No snapshot atual, 198 operações têm schema explícito de resposta; as quatro restantes são operações que retornam `204` sem corpo. A especificação é o contrato publicado, mas não garante que cada campo seja preenchido em toda resposta real: permissões, dados existentes e comportamento da conta podem variar.

## Endereço e autenticação

- Base URL da conta: `https://crcn.stays.net/external/v1` (configurada por `STAYS_BASE_URL`).
- Autenticação: HTTP Basic com `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET`.
- Envie `Accept: application/json`; para corpos JSON, envie também `Content-Type: application/json`.
- Mantenha os segredos no `.env` local ou em um gerenciador de segredos. Não os inclua no frontend, repositório, logs, relatórios ou exemplos literais.
- Chamadas autenticadas devem sair do backend. Não copie cookies da sessão web para integrações: a API usa as credenciais Basic emitidas para a API.

Exemplo de chamada somente leitura, com as variáveis já carregadas no ambiente do processo:

```bash
curl --fail-with-body --silent --show-error \
  --user "${STAYS_CLIENT_ID}:${STAYS_CLIENT_SECRET}" \
  -H 'Accept: application/json' \
  "${STAYS_BASE_URL}/booking/searchfilter"
```

Não habilite `set -x` ao carregar variáveis, pois isso pode imprimir segredos no terminal ou nos logs.

## Áreas da API

| Área | O que cobre | Exemplos de recursos |
|---|---|---|
| Booking | Busca de disponibilidade e preço, reservas, solicitações, hóspedes, pagamentos e serviços extras | `/booking/search-listings`, `/booking/calculate-price`, `/booking/reservations` |
| Calendar | Calendário, tarifas e restrições de anúncios | `/calendar/listing/{listingId}` |
| Content | Imóveis, anúncios, grupos e cômodos | `/content/listings`, `/content/properties` |
| Finance | Proprietários, lançamentos, posições, provedores e repasses OTA | `/finance/owners`, `/finance/accounting-transactions` |
| Promo codes | Consulta e gestão de códigos promocionais | `/booking/promo-codes` |
| Parr / preços | Regiões de preço, temporadas e tarifas sazonais | `/parr/price-regions`, `/parr/seasons-sell` |
| Settings | Configurações globais, do aplicativo e do anúncio | `/settings/global`, `/settings/listing/{listingId}` |
| SMM | Conversas e mensagens | `/smm/threads`, `/smm/threads/{threadId}/messages` |
| Reviews | Avaliações de hóspedes | `/reviews/guest` |
| Task Manager | Tarefas, colunas, anexos e automações | `/task-manager/api/tasks` |
| Users, Files, Translation, Core, Notifications e Statistics | Usuários, arquivos, tabelas de referência, tokens, notificações e estatísticas | Consulte a especificação OpenAPI |

Os nomes das áreas refletem as tags da especificação; a rota é formada pela base URL mais o caminho indicado.

## Consultas úteis para reservas

### Filtros de busca

`GET /booking/searchfilter` retorna opções de filtro aceitas pela busca, como localização, quartos e hóspedes. É uma consulta e não cria reserva.

### Disponibilidade

`GET` ou `POST /booking/search-listings` consulta anúncios disponíveis. O formato dos parâmetros depende do método; use o schema correspondente no OpenAPI. Na CRCN, o POST pode ser usado como consulta de leitura e não deve ser confundido com uma criação de reserva.

### Cálculo de preço

`GET` ou `POST /booking/calculate-price` calcula valores para anúncio e período. Trate o resultado como cotação da consulta; confirme novamente disponibilidade e preço antes do fechamento.

### Exportação e detalhe de reserva

- `POST /booking/reservations-export` retorna uma lista de reservas em JSON conforme os filtros definidos no corpo.
- `GET /booking/reservations/{reserveId}` consulta os detalhes de uma reserva.
- Para relacionar reserva, apartamento e condomínio, use os IDs retornados e consulte `GET /content/listings/{listingId}` e `GET /content/properties/{propertyId}`. Reaproveite os objetos já populados quando forem completos.

Confira no OpenAPI os filtros, paginação, propriedades retornadas e limites de cada operação antes de implementar relatórios.

## Leitura e escrita

Operações `GET` são consultas. Algumas operações `POST` também são consultas (por exemplo, busca, cálculo de preço e exportação); avalie a finalidade descrita na especificação, não apenas o verbo HTTP.

Criar, editar ou excluir reservas, pagamentos, tarifas, restrições, imóveis, códigos promocionais ou lançamentos financeiros altera o sistema Stays. Antes de executar uma escrita ao vivo:

1. confirme o objetivo e o estado final esperado;
2. confira método, schema, permissões e IDs na especificação da conta;
3. valide datas, valores, moeda e entidade alvo;
4. verifique a resposta e o estado resultante;
5. não repita uma operação não idempotente sem antes verificar se a primeira tentativa foi concluída.

O `POST /book-request` verifica a possibilidade de reserva e retorna um link para o hóspede completar o checkout na Stays. Não equivale a confirmar pagamento ou reserva finalizada.

## Respostas e tratamento de erros

- Verifique o status HTTP antes de interpretar o corpo. Só reporte sucesso quando a resposta e o estado corresponderem ao esperado.
- `401` normalmente indica falha de autenticação; `403`, falta de autorização para a rota/conta; `404`, caminho ou entidade não encontrado. Confirme o corpo e o contrato da resposta, pois o gateway pode variar.
- Para erros `4XX`/`5XX`, preserve a mensagem técnica necessária para diagnóstico, mas remova credenciais, dados pessoais e cabeçalhos de autenticação dos logs.
- Não considere respostas de mocks, dados locais ou fallbacks como retorno da API Stays.

## Dados pessoais e financeiros

Respostas podem conter dados de hóspedes, proprietários, reservas e mensagens. Mostre apenas o necessário para a tarefa e prefira agregações em relatórios. Diferencie valor total da reserva, comissão, pagamentos recebidos e lançamentos do razão do proprietário; não presuma que sejam equivalentes ou conciliados.

## Arquivos e referências

- Especificação OpenAPI da conta: [stays-openapi.json](stays-openapi.json)
- Swagger autenticado: `https://crcn.stays.net/external/v1/docs/`
- Referência pública: [Stays External API](https://stays.net/external-api/)

O arquivo OpenAPI local foi obtido do Swagger autenticado da conta CRCN em 08/10/2026. Se o Swagger mudar, atualize a cópia e revise este resumo. A documentação pública e as permissões da conta podem não cobrir os mesmos endpoints.
