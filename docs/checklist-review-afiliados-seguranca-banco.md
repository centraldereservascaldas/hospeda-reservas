# Checklist técnico de revisão do sistema de afiliados

Este checklist detalha segurança, performance, integridade e banco de dados. Para o roteiro funcional de homologação e publicação controlada, consulte [affiliate-production-checklist.md](affiliate-production-checklist.md). Itens concluídos não representam aprovação automática para produção.

## Estado da implementação

- [x] Portal e administração de afiliados consolidados na branch `codex/affiliate-portal`.
- [x] Atribuição server-side por short link, cookie de sete dias e associação da conversão ao pedido de checkout.
- [x] `codex/affiliate-portal-architecture` atualizada localmente com a `origin/main` mais recente.
- [x] Comissão bloqueada enquanto o pedido não estiver `concluido`, o checkout não tiver passado, a reserva não estiver `booked` ou o pagamento não estiver aprovado.
- [x] Ações de aprovação e pagamento, incluindo tentativas bloqueadas, registram ator, mudança de estado e evidências na tabela `affiliate_commission_events`.
- [x] Motivo obrigatório para aprovar comissão; histórico de auditoria disponível no painel administrativo.
- [x] Componentes administrativos de comissão separados do controller de gestão de contas e catálogo.
- [x] URLs públicas de afiliado usam `APP_URL`, sem refletir `Host` arbitrário.
- [x] Locks de clique não bloqueiam mais a linha da conta do afiliado.
- [x] Índices de consultas e integridade de status/percentual adicionados às migrations.
- [x] Link inativo não impede geração de um link ativo substituto.

## Bloqueadores antes de produção

- [ ] **P1 · Regra monetária da comissão.** O painel ainda envia `amountCents` escolhido pelo operador. Definir base de cálculo, moeda, arredondamento, tratamento de descontos/reembolsos, versão da regra e validação server-side. Não autorizar repasse enquanto o valor puder ser definido livremente sem reconciliação com contrato e reserva.
- [ ] **P1 · Evidência confiável de estadia concluída.** A documentação pública da API Stays descreve estados de reserva, mas não estabelece por si só uma confirmação de checkout do hóspede. Consultar a integração e a conta Stays em uso. Até existir sinal confiável, a aprovação deve depender de conferência humana registrada com referência verificável.
- [ ] **P1 · Operação que conclui o pedido.** A proteção atual exige `status=concluido`, data de checkout passada, `reservation_status=booked` e pagamento aprovado. O fluxo normal ainda não produz esse estado de conclusão; não marcar automaticamente apenas por data. Definir operação autorizada e auditada para confirmação de checkout.
- [ ] **P1 · Separação de funções financeiras.** Verificar se aprovação e registro de pagamento precisam de pessoas distintas, segundo política financeira; o sistema atual usa o mesmo papel administrativo.

## Auditoria e integridade

- [x] Eventos de aprovação, bloqueio, pagamento e bloqueio de pagamento registram ator, origem/destino, motivo ou referência e snapshot do pedido.
- [ ] **P2 · Resistência a adulteração.** A tabela é append-only pela aplicação, mas não é inviolável para uma credencial com acesso direto ao banco. Restringir `UPDATE`/`DELETE` para o papel da aplicação e avaliar exportação para armazenamento separado.
- [ ] **P2 · Rollback da auditoria.** A migration possui rollback que remove a tabela. Definir bloqueio operacional de rollback após existirem eventos financeiros e plano de retenção/exportação.
- [ ] **P2 · Integridade entre snapshots.** As FKs provam existência, mas não garantem que afiliado, short link, atribuição, imóvel e conversão correspondam entre si no banco. Avaliar constraints relacionais/estrutura de dados compatíveis com SQLite e PostgreSQL.
- [ ] **P2 · Histórico anterior.** Informar que eventos anteriores à migration não possuem trilha retroativa; não inventar evidência passada.

## Performance, escala e privacidade

- [x] Índices para FKs de atribuição/clique e ordenação global de conversões; removido índice redundante na migration-base de short links.
- [ ] **P2 · PostgreSQL e planos.** Rodar migrations e testes em PostgreSQL isolado, medir contenção concorrente e guardar `EXPLAIN` com volume representativo antes de aprovar índices para produção.
- [ ] **P2 · Cliques e dashboard.** A tabela mantém um registro por clique, sem política de retenção/agregação. O dashboard calcula contagem total a cada acesso. Definir volume, retenção, agregados e plano de consulta antes de escala.
- [ ] **P2 · Bots e prefetch.** O redirect GET registra clique, inclusive potencialmente crawler ou preview. Definir critérios de clique válido, deduplicação e métricas antes de usar contagem para decisões ou pagamentos.
- [ ] **P2 · Cookie e dados pessoais.** Confirmar base legal, transparência/consentimento, finalidade e retenção da atribuição de sete dias com responsável jurídico/privacidade.

## Contratos e migrations

- [ ] **P2 · Criação de short link em GET.** `GET /api/affiliate/links/{listingId}` ainda cria registro. Migrar para POST coordenando frontend e contrato para evitar efeitos de prefetch.
- [ ] **P2 · Migrations previamente aplicadas.** A migration de short links foi ajustada para permitir um registro ativo e um inativo por afiliado/imóvel. Se algum banco já executou a migration anterior, criar migration de transição em vez de editar histórico compartilhado.
- [ ] **P2 · CHECK constraints no PostgreSQL.** A migration executa CHECKs no PostgreSQL e pula SQLite por limitação de alteração de tabela existente. Validar sintaxe, rollback e dados existentes em PostgreSQL antes de deploy.
- [x] Testes cobrem bloqueio pré-checkout, checkout na data atual, auditoria, host arbitrário e substituição de link inativo.

## Branches e documentação

- Branch local consolidada: `codex/affiliate-portal`.
- O checklist de homologação cobre ambiente, jornadas ponta a ponta e liberação. Este documento cobre riscos técnicos, segurança e banco.
- A branch inclui as alterações da antiga `codex/affiliate-portal-architecture` e preserva os commits próprios que já existiam em `codex/affiliate-portal`.
- O checkout principal e suas alterações de calendário/UX foram preservados.
- Não foi feito merge em `main` nem deploy.

## Validação desta rodada

- Testes focados: `AffiliateAccessTest`, `AffiliateShortLinkTest` e `DirectCheckoutIntegratedJourneyTest` passaram (29 testes, 474 assertions).
- `migrate:fresh --env=testing --force` passou em SQLite `:memory:`; Pint e `git diff --check` passaram.
- `npm run build` passou, com avisos existentes de fonte não resolvida, módulo Supabase em import dinâmico/estático e chunk acima de 500 kB.
- `npm ci` informou 8 vulnerabilidades moderadas no conjunto de dependências; não alterei dependências nesta consolidação.
- Atualizado em: 26/11/2026.
