# Checklist técnico de revisão do sistema de afiliados

Este checklist detalha segurança, performance, integridade e banco de dados. Para o roteiro funcional de homologação e publicação controlada, consulte [affiliate-production-checklist.md](affiliate-production-checklist.md). Itens concluídos não representam aprovação automática para produção.

## Organização modular e qualidade do código

Objetivo: fazer mudanças pequenas por fluxo, preservando os contratos consumidos pelo frontend e mantendo a API atual. Extrair uma responsabilidade quando ela puder ser descrita e validada isoladamente; não criar camadas genéricas sem necessidade concreta.

### Backend Laravel

- [ ] Separar `AffiliateAccessController` em ações distintas para solicitação de acesso, leitura de catálogo e criação de link. Mover criação/recuperação idempotente do short link para um serviço de domínio.
- [ ] Separar `AffiliateAdminController` por responsabilidade: ciclo de vida da conta, configuração de comissão e disponibilidade de imóveis. Centralizar transições permitidas e registrar ator, estado anterior/novo e motivo nas mudanças administrativas.
- [ ] Manter controllers finos: entrada HTTP, chamada autorizada ao caso de uso e resposta no contrato atual. Mover consultas complexas do dashboard/admin para consultas nomeadas ou serviços de leitura quando isso melhorar teste e entendimento.
- [ ] Completar Form Requests nas mutações administrativas e de afiliado; concentrar validação e autorização da ação no Request/Policy apropriado em vez de repetir validação inline.
- [ ] Formalizar Policy/Gate para ações e recursos do afiliado/admin e testar acesso cruzado entre afiliados, contas suspensas e operadores sem permissão.
- [ ] Separar no fluxo de comissão a elegibilidade, cálculo monetário futuro, aprovação e registro de pagamento. O cálculo só deve ser introduzido após regra comercial aprovada; não duplicar regras entre controller e dashboard.
- [ ] Padronizar resposta de API e mapeamento de erros sem expor exceções, dados pessoais, token do link ou detalhes internos ao afiliado.
- [ ] Trocar criação de short link de GET para POST, mantendo compatibilidade coordenada no frontend durante a migração.

### Frontend React

- [ ] Dividir `AffiliatePortal` por jornada: sessão/acesso, catálogo e geração/compartilhamento de links, resumo e lista de conversões. Extrair hooks de dados quando houver lógica de estado/efeitos reutilizável ou que esconda complexidade relevante.
- [ ] Dividir `AffiliateAdminPanel` por operação: solicitações/contas, catálogo, fila de comissões e histórico de auditoria. Manter componentes visuais pequenos e com props/tipos explícitos.
- [ ] Separar acesso HTTP e tipos de resposta em módulo do domínio afiliado, validando o formato recebido antes de exibir. Preservar mensagens simples para o afiliado e detalhes técnicos somente nos logs internos.
- [ ] Garantir estados explícitos de carregamento, vazio, erro, sucesso e acesso negado em cada jornada, além de acessibilidade de labels, botões, foco e navegação por teclado.
- [ ] Evitar extrações cosméticas: cada componente/hook deve ter uma responsabilidade entendível e reduzir complexidade do pai.

### Logs, auditoria e operação

- [ ] Definir convenção de eventos diagnósticos estruturados com `request_id`, ação, resultado, código de erro e IDs internos necessários para correlação; nunca registrar senha, bearer/cookie, token de afiliado, dados completos do hóspede ou credenciais de pagamento.
- [ ] Diferenciar log técnico de auditoria financeira. Logs ajudam a localizar falhas; `affiliate_commission_events` comprova decisões de negócio. Definir retenção, acesso, alertas e exportação resistente a alteração para os eventos financeiros.
- [ ] Registrar falhas e resultados relevantes de geração/redirecionamento de links, atribuição, associação ao checkout, consulta de catálogo, bloqueio de comissão e repasse sem transformar cada clique em log de alto volume.
- [ ] Criar alertas para erros de integração e padrões operacionais (por exemplo, conversão sem atribuição esperada, falhas repetidas de catálogo e bloqueios financeiros), com limiares e responsáveis definidos.
- [ ] Confirmar que respostas e telemetria não revelam identidade do titular da reserva ao afiliado. Exibir apenas os dados mínimos aprovados pelo produto.

### Status de comissão e repasses

- [ ] Formalizar uma máquina de estados para comissão por reserva. Hoje o enum persistido contém apenas `pending`, `approved` e `paid`; a interface também declara `rejected`, enquanto o dashboard pode sintetizar `review` ao detectar divergência de elegibilidade. Alinhar estados persistidos, transições, motivos, rótulos e apresentação pública.
- [ ] Separar estado da reserva, estado da comissão e estado do saque. Uma comissão pode estar confirmada/disponível sem ter sido paga ao afiliado; o repasse tem ciclo e auditoria próprios.
- [ ] Criar razão de saldo imutável com lançamentos de crédito da comissão confirmada, débito de saque, taxa de R$ 5, estorno/reversão e ajustes autorizados. Guardar saldo calculável e snapshots por transação em vez de editar um total sem histórico.
- [ ] Implementar pedido de saque mínimo de R$ 150 e lote de processamento quinzenal, com cálculo e exibição de valor bruto, taxa fixa de R$ 5 e líquido, idempotência, estados, ator, datas, referência de transferência e justificativa de rejeição/ajuste.
- [ ] Definir datas de corte dos ciclos, regras para fins de semana/feriados, pedido em análise, cancelamento de pedido e saldo insuficiente. O acordo da frequência e valores está registrado no checklist de homologação, mas esses detalhes operacionais ainda faltam.
- [ ] Garantir que toda transição financeira gere evento auditável append-only; incluir eventos de solicitação, aprovação/rejeição, inclusão em lote, pagamento, falha de transferência, estorno e ajustes manuais.
- [ ] Revisar UX/UI com afiliados e operação: resumo do disponível/pendente/pago, comissões por reserva, extrato de saldo, saques e taxa/líquido, métodos de pagamento, ajuda e termos. Nunca misturar reserva, comissão e saque num único status.

### Critérios de conclusão por etapa

- [ ] Cada mudança tem testes de unidade/feature para regra de domínio e autorização, além de teste de integração quando cruza checkout, banco ou serviço externo.
- [ ] Contrato frontend/API, migration SQLite e PostgreSQL, privacidade, observabilidade e procedimento de rollback são revisados antes de avançar a etapa.
- [ ] PRs de organização preservam comportamento; refatoração e mudança funcional/financeira não são misturadas sem motivo documentado.
- [ ] Ao final, remover duplicação e código morto relacionado ao fluxo alterado; atualizar este checklist e o checklist de homologação com evidências executadas.

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

- [ ] **P1 · Homologar a regra monetária da comissão.** A aprovação calcula no servidor sobre `quote_total` BRL usando os basis points congelados na conversão (padrão 3,5%) e registra versão, taxa e valor no evento de auditoria; o valor enviado pelo cliente não é usado. Confirmar o mapeamento do campo da Stays e regras para descontos, cancelamento e reembolso antes de liberar repasses em produção.
- [ ] **P1 · Sincronização Stays ↔ banco local.** A Stays fornece os dados operacionais da reserva; o banco local mantém atribuição, snapshot do valor/regra, comissão e razão financeiro/auditoria. No OpenAPI incluído há GET de reserva por ID e pagamentos por ID, sem endpoint de webhook; a listagem filtra por datas/tipo e não documenta `updated_at`. Projetar polling idempotente das reservas locais conhecidas, retries/alertas e reconciliação manual, sem sobrescrever eventos financeiros locais.
- [ ] **P1 · Contrato de valor e confirmação.** Validar com respostas reais da conta Stays o significado de `price._f_total`, `hostingDetails`, `fees`, `discounts` e pagamentos `pending`/`completed`, inclusive limpeza e reembolsos. O schema de reserva não mostra estado explícito de checkout concluído; manter confirmação autorizada/auditada até existir evidência confiável.
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
- Atualizado em: 27/11/2026.
