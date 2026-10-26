# Reservas e hóspedes

Use este playbook para disponibilidade, cotação, solicitação de reserva, operação de reservas existentes, pagamentos, extras e cadastro de hóspedes. Confirme método, body, parâmetros, enums e resposta em `references/stays-openapi.json` antes de montar a chamada.

## Encontrar disponibilidade e cotar

1. Obtenha IDs e filtros válidos em `GET /booking/searchfilter` quando forem necessários.
2. Consulte `GET` ou `POST /booking/search-listings` com datas, ocupação e filtros documentados para aquele método. POST nessa rota é consulta.
3. Calcule valores em `GET` ou `POST /booking/calculate-price`; use o resultado retornado pela Stays, moeda e composição de preço. Não estime taxas ausentes.
4. Revalide disponibilidade e preço antes de iniciar fechamento. Cotação é uma fotografia da consulta, não bloqueio de inventário.
5. `/book-request` valida a possibilidade e prepara o link de checkout. Só a confirmação retornada por uma consulta posterior comprova o estado final da reserva.

## Criar ou alterar reserva

- Antes de `POST /booking/reservations`, confirme que o pedido é para criar uma reserva diretamente na Stays e valide anúncio, cliente, período, hóspedes, tipo/status, preço/moeda e regras de pagamento. Consulte o schema integral e os enums; não construa o body por analogia.
- Para editar, leia `GET /booking/reservations/{reserveId}`, aplique somente os campos autorizados via `PATCH`, e releia o detalhe para comparar o estado final.
- `DELETE /booking/reservations/{reserveId}` é remoção real. Confirme claramente a reserva e a intenção antes da chamada; não use como sinônimo de cancelamento sem verificar semântica e status documentados.
- Se houver timeout em criação, pagamento ou envio, procure o registro pelo endpoint de leitura antes de repetir.

## Pagamentos e extras

- Liste pagamentos e serviços existentes antes de alterá-los: `GET /booking/reservations/{reserveId}/payments` e `/extra-services`.
- Criar, editar ou excluir itens desses recursos muda o registro financeiro da reserva. Confira moeda, valor, tipo e vínculo; após a mutação, consulte novamente.
- Não conclua que um pagamento foi recebido apenas porque há um registro ou link de checkout. Interprete estado/status conforme schema e resposta reais.
- Enviar PDF por `POST /booking/reservations/{reserveId}/send-email` é comunicação externa, não simples leitura; confirme destinatário/template/objetivo e não repita automaticamente.

## Exportar reservas e identificar hóspedes

- `POST /booking/reservations-export` retorna dados de relatório; defina `dateType` (criação, chegada, saída etc.), intervalo, timezone e escopo de status antes de agregar. Valide localmente a data escolhida quando a API incluir registros fora da janela.
- Para relacionar registro, anúncio e propriedade, siga o fluxo de IDs descrito em `booking-operations.md`; reutilize objetos completos já retornados.
- Minimize nomes, telefones, e-mails, documentos e IDs na resposta. Exiba dados de contato somente quando necessários para a tarefa operacional pedida.

## Clientes

`GET /booking/clients` e `GET /booking/clients/{clientId}` permitem localizar dados. Criar ou atualizar em `POST/PATCH /booking/clients` altera dados pessoais; valide identidade para evitar duplicatas e atualize apenas os campos solicitados. Leia de volta após a escrita.
