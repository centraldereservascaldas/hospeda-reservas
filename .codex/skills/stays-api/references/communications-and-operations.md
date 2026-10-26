# Comunicações e operação

Use para mensagens nas conversas Stays, e-mails da reserva, notificações, avaliações e tarefas operacionais.

## Mensagens e e-mails

- `GET /smm/threads` e rotas de detalhe/listagem de mensagens são leituras. Localize a conversa pelo critério documentado e verifique destinatário/contexto antes de usar um ID.
- `POST /smm/threads/{threadId}/messages`, `POST /booking/reservations/{reserveId}/send-email` e `POST /notifications/push` enviam ou enfileiram comunicações externas. Antes de enviar, confirme destinatário, conteúdo, canal, idioma e intenção. O sucesso técnico de enfileiramento não garante entrega.
- Não repita envio após timeout sem consultar a thread/estado de entrega disponível ou confirmar que não foi processado.
- Minimize o conteúdo pessoal e não envie credenciais, documentos, dados financeiros desnecessários ou informações de outro hóspede.

## Avaliações

- `GET /reviews/guest` consulta avaliações. Criar ou editar avaliação interna por `POST/PATCH` altera registro operacional; confirme hóspede, reserva e texto/nota pretendidos. Não trate avaliação interna como publicação pública sem evidência.

## Tarefas

- Leia prioridades, tipos, colunas, status, tarefa e anúncio associado antes de criar/editar/mover tarefa (`/task-manager/api/*`). Use o schema para distinguir `PUT` substitutivo de PATCH e campos obrigatórios.
- Criação, mudança de coluna/status, anexos, automações e exclusões são mutações. Confirme título, responsável, anúncio, vencimento e efeito esperado; releia a tarefa após salvar.
- Exclusão de coluna é descrita como soft delete no contrato, mas confirme efeitos sobre tarefas existentes. Não assuma que excluir automação interrompe execuções já enfileiradas.

## Outros recursos

Para notificações, surveys, usuários, arquivos ou configurações auxiliares, localize a operação pelo OpenAPI e leia `references/side-effects.md`. O verbo HTTP sozinho não informa se haverá envio, exposição de dados ou alteração persistente.
