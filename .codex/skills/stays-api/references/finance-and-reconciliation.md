# Financeiro e conciliação

Use para consultar saldos/movimentações de proprietários, posições financeiras, transações contábeis, provedores de pagamento e repasses OTA. Leia os schemas das rotas antes de calcular ou escrever.

## Investigar valores

- Comece pelo recurso que responde à pergunta: `/finance/owners?from=...&to=...` para resumo de proprietários no período; `/finance/owners/{ownerId}` ou `/{ownerId}/{listingId}?from=...&to=...` para detalhes do razão; `/finance/accounting-transactions` para lançamentos da operação; `/finance/positions` para posições/categorias; `/finance/ota-payouts` para repasses de canais.
- Confirme no schema a base do período, parâmetros, status, paginação e relação entre proprietário, anúncio e transação. Não invente filtros de data/status.
- `accounting-transactions` exige `from`, `to` e `dateType` (`creation`, `payment`, `expiration` ou `competence`); aceita tipo crédito/débito e paginação `skip`/`limit` (máximo 100 no snapshot). Escolha a data coerente com a pergunta; não misture períodos com bases diferentes.
- `ota-payouts` permite período de até um ano no snapshot, com `dateType` `expected`, `paid` ou `reference`; filtros incluem canal (`airbnb`, `bookingcom`) e status (`pending`, `paid`, `partially_paid`, `cancelled`, `unknown`). Os itens de um repasse podem abranger reservas inteiras mesmo ao filtrar por `reservationPartnerCode`.
- O resumo de `/finance/owners` e os detalhes não são relatórios idênticos: a lista entrega totais e anúncios; o detalhe por anúncio inclui `balance`, `lifeBalance` e `accounts`. Informe qual recorte foi lido.
- Preserve o status literal retornado e separe valores pendentes, cancelados, confirmados e desconhecidos quando os campos permitirem.
- `reserveTotal`, pagamentos da reserva, comissão, recebimento bancário, crédito/débito do razão e repasse de OTA são medidas diferentes. Só concilie se a conta documentar uma chave de correspondência e regra contábil apropriadas.
- A Stays documenta que a Open API não executa transferências interbancárias; ela registra/valida movimentos e expõe dados do balanço do proprietário. Portanto, uma resposta de API ou lançamento `paid` não prova que o banco efetivou uma transferência; confirme no canal bancário quando a pergunta for sobre dinheiro liquidado.
- Ao reportar, declare período e critério de data, estados incluídos, moeda, filtros locais, registros incompletos e fórmula de agregação. Minimize dados pessoais e IDs de proprietário.

## Escritas financeiras

- Criar/editar/excluir lançamento em `/finance/accounting-transactions` ou `/finance/owners/{ownerId}/{listingId}` altera livros financeiros. Confirme entidade, natureza crédito/débito, valor, moeda, data, categoria/posição, status e justificativa antes da chamada.
- Consulte os lançamentos existentes para detectar duplicatas antes de criar; em timeout, releia antes de repetir.
- Após mutar, recupere o lançamento e o resumo relacionado para confirmar o efeito. Não declare dinheiro transferido ou pago com base apenas em lançamento contábil.
- Alterar `payment-providers` configura meios de pagamento. Leia o provedor e confirme o escopo antes de qualquer escrita; credenciais associadas devem permanecer em secret manager/configuração protegida.
