# Classificar efeitos das operações

Use o objetivo descrito no OpenAPI para classificar cada chamada; o verbo sozinho não basta. Há POSTs de busca/exportação que leem dados e GETs que podem revelar informação sensível.

| Classe | Exemplos | Conduta |
|---|---|---|
| Leitura | GETs de busca, detalhe, calendário, financeiro ou conteúdo; POSTs de busca/preço/exportação | Pode executar quando a consulta foi pedida. Limite período e dados ao necessário; redija PII. |
| Ação externa sem alteração principal de cadastro | Enviar mensagem, e-mail, push ou gerar link de checkout | Pode afetar pessoas ou iniciar um fluxo. Confirme destinatário/objetivo e explique o efeito; não repita automaticamente. |
| Mutação | Criar, atualizar, cancelar ou excluir reserva, pagamento, tarifa, restrição, imóvel, lançamento ou configuração | Exige autorização clara para a operação específica antes da chamada ao vivo. Valide entidade, ID, datas, valores e estado final. |

## Operações não idempotentes

POSTs de criação e ações de comunicação podem duplicar registros ou envios. Se houver timeout ou conexão interrompida, não repita sem verificar o estado no endpoint de leitura correspondente ou confirmar que a primeira chamada não foi processada.

## Fluxos de reserva

- `/booking/search-listings` e `/booking/calculate-price` são consulta quando usados com os parâmetros documentados.
- `/book-request` verifica possibilidade e retorna link de checkout para o hóspede. Não confirme reserva ou pagamento final com base apenas nesse link.
- Criar/alterar/cancelar/excluir reserva e seus pagamentos são mutações; trate cada uma separadamente e verifique estado depois.
- Pagamentos, valor da reserva, comissão e lançamentos do razão de proprietário são conceitos diferentes. Não os some nem concilie sem regra confirmada.
