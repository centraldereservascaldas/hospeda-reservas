# Checklist de homologação do portal de afiliados

Este checklist acompanha a homologação funcional e a preparação de publicação do portal. Para riscos técnicos, segurança e banco, consulte [checklist-review-afiliados-seguranca-banco.md](checklist-review-afiliados-seguranca-banco.md). Publicação depende da conclusão dos bloqueadores aplicáveis e dos controles operacionais.

## Validações locais já executadas

- [x] `AffiliateAccessTest.php`: 6 testes, 97 assertions.
- [x] `DirectCheckoutIntegratedJourneyTest.php`: 17 testes, 338 assertions.
- [x] `checkoutAttributionIntegration.test.ts`: 4 testes frontend relacionados à integração de atribuição.
- [x] TypeScript frontend e build Vite.

Comando rápido para repetir a validação frontend do portal:

```bash
npm run test:affiliate
```

## Funcionalidades entregues

- [x] Cadastro, login e solicitação de acesso via Supabase.
- [x] Aprovação, recusa, suspensão e reativação de afiliados.
- [x] Percentual de comissão configurável por afiliado.
- [x] Catálogo de imóveis liberados para divulgação.
- [x] Bloqueio administrativo de imóveis para novos links.
- [x] Link individual com token opaco aleatório gerado no servidor.
- [x] Captura da indicação com validade e escopo por imóvel.
- [x] Indicação armazenada no backend e recuperada pelo cookie no mesmo navegador por sete dias.
- [x] Link curto pode ser aberto em outro dispositivo: o redirecionamento cria uma nova atribuição server-side naquele dispositivo.
- [ ] Recuperação de uma atribuição sem reabrir o link (por login/código) ainda não existe e não faz parte do fluxo atual.
- [x] Vínculo server-side entre checkout, reserva e afiliado.
- [x] Comissão pendente e fluxo administrativo de aprovação/registro de pagamento, protegido por elegibilidade de estadia concluída. A regra monetária ainda não é calculada pelo servidor.
- [x] Isolamento das reservas exibidas para cada afiliado.
- [x] Paginação dos painéis.

## Roadmap de produto baseado no código

O portal existente já autentica o usuário pela conta Supabase compartilhada com a área de cliente. A participação de afiliado é um acesso separado, armazenado em `affiliate_accounts`, com aprovação própria. Os itens abaixo são capacidades ainda não encontradas na implementação atual.

### P0 · Validação reproduzível

- [x] Corrigir `npm run test:affiliate`: o script agora aponta somente para `tests/checkoutAttributionIntegration.test.ts`, existente na branch. O comando cobre quatro testes; o arquivo `affiliateAttribution.test.ts` não existe e não é contado como cobertura executada.

### P1 · Destravar operação financeira segura

- [x] **Referência de comissão para o MVP:** 3,5% do valor total da reserva; custos operacionais são apurados separadamente pela empresa. Usar como base inicial de modelagem e medição, sem comunicar renda garantida.
- [ ] Fechar o mapeamento do “valor total da reserva” para os campos reais da Stays: diárias, taxa de limpeza, descontos, taxas, pagamento recebido e estornos. A conversa indicou o total da reserva como referência, mas o campo/fórmula exatos e os ajustes por reembolso ainda precisam ser confirmados.
- [ ] Tratar a comunicação de “25% a 40% do que a administradora ganha” como possível forma de apresentar a proposta comercial, não como segunda regra do motor de comissão. Só publicar essa equivalência depois de conferir com dados reais da Stays e aprovação Comercial/Financeiro/Jurídico.
- [x] Calcular a comissão no servidor usando `quote_total`, moeda BRL, arredondamento half-up e a taxa em basis points congelada na conversão. O padrão para novas aprovações é 3,5%; eventos de aprovação guardam versão da fórmula, taxa e valor calculado. O valor enviado pelo navegador é ignorado.
- [ ] Validar o mapeamento do `quote_total` para o valor total esperado da Stays e definir descontos, cancelamentos, no-show, reembolso total/parcial e estorno antes de liberar produção.
- [ ] Integrar a Stays ao banco local: reconciliar por ID externo da reserva status, datas, valores, pagamentos, cancelamentos e reembolsos. A Stays é fonte dos dados operacionais; o banco local mantém atribuição, snapshot da regra/cálculo, eventos de auditoria, saldo e pedidos/repasses.
- [ ] Implementar sincronização idempotente. No OpenAPI incluído não há endpoint de webhook de reserva; há leitura de detalhe por ID e pagamentos por ID. Consultas de listagem filtram por intervalos de datas e tipo, mas não documentam filtro por `updated_at`; não as tratar como feed confiável de alterações. Definir polling das reservas locais conhecidas, limites/retries e reconciliação manual para falhas/divergências.
- [ ] Confirmar na resposta real da conta Stays como `price._f_total`, `price.hostingDetails`, `fees`, `discounts` e pagamentos (`pending`/`completed`) correspondem ao total comercial da reserva. O schema ajuda a localizar os dados, mas não esclarece sozinho a inclusão de limpeza nem confirma recebimento líquido da empresa.
- [ ] Definir evidência confiável de estadia concluída e uma ação operacional autorizada e auditada. O código exige pedido `concluido`, checkout passado, reserva `booked` e pagamento aprovado, mas o fluxo normal ainda não leva o pedido a `concluido`. O schema de reservas consultado expõe tipos como `reserved`, `booked` e `canceled`, mas não um estado explícito de checkout realizado; não inferir checkout apenas da data.
- [ ] **Calendário proposto:** fechar cada mês civil completo (primeiro ao último dia, incluindo meses com 28, 29 ou 31 dias) e repassar até o quinto dia útil do mês seguinte. Confirmar responsáveis, feriados/calendário, conciliação e tratamento de valores em disputa antes de ativar.
- [x] **Regra de saque definida:** saque mínimo de R$ 150 por solicitação; solicitação feita pelo afiliado; repasses processados em ciclos quinzenais; taxa fixa de R$ 5 por saque. Exibir antes do pedido o valor bruto solicitado, a taxa e o líquido previsto. O ciclo quinzenal substitui as alternativas mensal e semanal discutidas anteriormente.
- [ ] Definir calendário operacional dos ciclos quinzenais (datas fixas, corte, fins de semana/feriados), prazo de análise, responsável pelo processamento e procedimento para pedido incompleto ou rejeitado.
- [ ] Definir tratamento de saldo inferior a R$ 150 no encerramento da conta e se a taxa de R$ 5 é descontada do saldo ou adicionada ao pedido, registrando bruto, taxa e líquido no histórico.
- [ ] Definir se a comissão nasce como pendente após a reserva, passa por revisão, fica confirmada após checkout e pagamento aprovado, e fica paga após o repasse. Definir nomes e tratamento de cancelamento, reembolso, no-show e estorno parcial; a semântica não está fechada.
- [ ] Validar a operação de sincronização Stays ↔ banco local em homologação com criação, alteração, cancelamento, reembolso e retry, assegurando idempotência e trilha de divergências. Não duplicar ou sobrescrever o histórico financeiro já registrado localmente.
- [ ] Definir cadastro financeiro do afiliado e documentos necessários (nome/dados completos, endereço, e-mail e dados para pagamento), finalidade, acesso restrito, retenção, exclusão e fornecedor de armazenamento antes de coletar documentos sensíveis.
- [ ] Decidir separação de funções para aprovação e pagamento, atualmente acessíveis ao mesmo papel administrativo.

### P1 · Experiência, privacidade e comunicação do programa

- [ ] O portal pode mostrar que houve uma reserva, datas, imóvel e situação da comissão, sem nome ou outros dados do hóspede. Manter a decisão de não revelar a identidade do titular ao afiliado.
- [ ] Revisar a UX/UI do portal inteiro: hierarquia visual, resumo financeiro, nomes e explicações dos status, navegação entre catálogo/links/reservas/saldo/saques, estados vazios e de erro, responsividade e acessibilidade.
- [ ] Definir o painel do afiliado em blocos claros: visão geral (saldo disponível, pendente e já pago), reservas/comissões por reserva, histórico de saques (solicitado, em análise, programado, pago ou rejeitado, conforme processo aprovado), taxa e líquido de cada pedido, dados de pagamento e ajuda/termos.
- [ ] Exibir separadamente status da reserva, status da comissão e status do saque. Não chamar uma comissão de paga quando ela apenas foi aprovada ou entrou no saldo disponível.
- [ ] Dar acesso individual ao afiliado para acompanhar suas indicações e comissões. Não distribuir credenciais compartilhadas; cada pessoa deve criar/usar sua própria conta autenticada.
- [ ] Criar estratégia de divulgação e presença em redes sociais, com regras de uso da marca, conteúdo permitido e divulgação transparente de links de afiliado.
- [ ] Preparar termos e copy apenas depois de aprovar percentual, base de cálculo, prazo, critérios de confirmação, cancelamentos e repasse. Não apresentar como garantida renda ou comissão ainda em discussão.
- [ ] Rever com advogado a política de cancelamento e reembolso do hóspede para locação por temporada, inclusive a aplicação do direito de arrependimento em contratação online e reservas próximas da data de entrada. A conversa contém hipóteses conflitantes; não converter a transcrição em orientação jurídica nem em regra do sistema.

### P1 · Especificar e construir aquisição de afiliados

- [ ] Especificar e criar página pública de recrutamento com proposta de valor, funcionamento, critérios, benefícios e cadastro.
- [ ] Criar copy comercial persuasiva sem renda garantida ou ganhos típicos não demonstrados. Só comunicar regra e exemplos financeiros depois da aprovação comercial, financeira e jurídica.
- [ ] Alinhar texto público, contrato, painel e cálculo do sistema para apresentarem a mesma base, condições e prazos.

### P2 · Campanhas, UTMs e links

- [ ] Permitir criar campanhas nomeadas e gerar múltiplos links por campanha. Hoje o portal gera um link ativo por afiliado/imóvel.
- [ ] Permitir link para páginas elegíveis do site, além da página de imóvel do catálogo. Validar destinos no servidor para impedir open redirect e preservar atribuição.
- [ ] Associar UTMs/campanha ao link e salvar esses dados na atribuição/conversão. O checkout já coleta atribuição de marketing geral, mas não há vínculo de campanha controlado pelo afiliado.
- [ ] Exibir métricas por campanha: cliques válidos, conversões e status/valor de comissão, com definição de bot, deduplicação, retenção e privacidade antes de usar os números para pagamento.

### Futuro · Preço com acréscimo definido pelo afiliado (over/markup)

- [ ] Manter fora do escopo atual. Avaliar posteriormente um modo opcional em que afiliados aprovados definem um acréscimo para links, campanhas ou imóveis específicos. Não confundir com a comissão padrão do programa nem com o modelo `overprice` do contrato entre administradora e proprietário na Stays.
- [ ] Antes de implementar, decidir modelo de remuneração (substitui ou acumula com comissão), base elegível, formatos fixo/percentual, limites administrativos, precedência entre regra por imóvel/campanha/padrão do afiliado, estabilidade de links existentes e tratamento de cancelamentos, reembolsos e chargebacks.
- [ ] Exigir cálculo server-side sobre cotação atual da Stays, apresentação clara do preço total ao hóspede e conciliação separada entre preço-base, acréscimo, valor cobrado e repasse ao afiliado.
- [ ] Validar modelo comercial, contratual, contábil e jurídico antes de ativar. O checkout atual exige correspondência com o preço cotado pela Stays e não suporta acréscimo de afiliado.

### P2 · Evoluir a experiência do afiliado

- [ ] Avaliar recuperação de atribuição entre dispositivos por login ou código. Hoje abrir o short link em outro dispositivo cria uma nova atribuição nesse dispositivo; não recupera uma atribuição anterior sem reabrir o link.
- [ ] Adicionar dados financeiros e envio/validação de documentos apenas após definir requisitos jurídicos, privacidade, armazenamento, retenção, acesso e fornecedor apropriado. Não armazenar documentos sensíveis sem controles definidos.
- [ ] Publicar termos do programa, regras de divulgação, elegibilidade, cancelamento, uso de marca, privacidade e encerramento de conta após revisão jurídica.

### P3 · API para afiliados

- [ ] Especificar operações permitidas, autenticação, autorização por conta, escopos, rate limits, revogação de credenciais, logs, versão e documentação.
- [ ] Implementar API somente após estabilizar contratos de campanhas, links e métricas, para evitar expor endpoints provisórios.

### Dependências de homologação e escala

- [ ] Corrigir o template `.env.homologation.example`: a configuração de Cielo sandbox está ligada por padrão e faltam as flags gerais `DIRECT_BOOKING_*`, que permanecem desligadas no `.env.example`. Manter pagamentos desativados por padrão e descrever ativação explícita para teste autorizado.
- [ ] Garantir que segredos preenchidos no template sejam cadastrados somente no gerenciador de segredos da homologação e nunca gravados no arquivo versionado.
- [ ] Validar migrations, constraints, índices e concorrência em PostgreSQL isolado; confirmar impacto antes de aplicar em banco compartilhado.
- [ ] Definir retenção/agregação de cliques, filtragem de bots/prefetch e base legal do cookie de sete dias.
- [ ] Migrar a criação de short link de `GET /api/affiliate/links/{listingId}` para `POST`, evitando efeitos causados por prefetch.

## Configuração de homologação

- [ ] Criar projeto Supabase de teste e confirmar que não é o projeto de produção.
- [ ] Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` somente no ambiente de teste.
- [ ] Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no backend de teste.
- [ ] Configurar `OWNER_ADMIN_EMAILS` com uma conta administrativa de teste.
- [ ] Configurar `STAYS_BASE_URL`, `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` no backend de teste.
- [ ] Manter `STAYS_SIMULATOR_ENABLED=false` quando a homologação usar a Stays sandbox.
- [ ] Configurar `CIELO_DIRECT_ENVIRONMENT=sandbox` e, se o fluxo Cielo for usado, `CIELO_SANDBOX_ENABLED=true`.
- [ ] Configurar `CIELO_SANDBOX_MERCHANT_ID` e `CIELO_SANDBOX_MERCHANT_KEY` somente no backend de teste.
- [ ] Configurar `APP_URL` e as URLs de redirect do Supabase para o domínio de homologação.
- [ ] Executar as migrations de afiliados no banco de teste.
- [ ] Confirmar que `APP_KEY` do teste é diferente da produção.
- [ ] Confirmar CORS, cookies e HTTPS no domínio de teste.

Um modelo sem credenciais está em `.env.homologation.example`. Ele deve ser preenchido apenas no ambiente de homologação; não copie valores reais para o Git.

## Roteiro ponta a ponta

1. Criar uma conta de afiliado usando um e-mail de teste.
2. Solicitar acesso e aprovar pelo painel administrativo.
3. Definir uma comissão de teste, por exemplo 10%.
4. Liberar um imóvel de teste e gerar o link.
5. Abrir o link em um navegador de teste.
6. Confirmar a captura da indicação e a validade do token opaco, inclusive abrindo o mesmo link em outro dispositivo.
7. Criar uma reserva de teste no checkout sandbox.
8. Confirmar que a reserva aparece somente para o afiliado correto.
9. Confirmar que a comissão nasce como `pending`.
10. Tentar aprovar antes de pagamento confirmado; deve ser recusado.
11. Confirmar o pagamento sandbox e a reserva confirmada.
12. Confirmar que a aprovação permanece bloqueada até existir evidência registrada de checkout concluído e valor reconciliado. O valor continua manual e isso é bloqueador financeiro.
13. Registrar o repasse com uma referência de teste.
14. Repetir o fluxo com retry/idempotência e confirmar que não duplica comissão.
15. Cancelar uma reserva de teste e validar a regra de comissão.

## Bloqueadores atuais

- [x] Testes Laravel focados executados localmente: 29 testes e 474 assertions passaram.
- [ ] Executar a suíte completa e repetir testes em PostgreSQL isolado antes da publicação.
- [ ] Ainda não há ambiente Supabase/Stays/Cielo sandbox confirmado para esta homologação.
- [ ] A regra financeira de comissão precisa ser aprovada e calculada/validada no servidor: valor bruto, líquido ou margem, descontos, reembolsos, moeda e arredondamento.
- [ ] O fluxo normal ainda não conclui automaticamente o pedido. Definir evidência confiável, transição autorizada e auditoria para checkout concluído. A política de cancelamento, no-show e reembolso também precisa ser definida antes do pagamento.
- [ ] O repasse continua manual; não há pagamento automático ao afiliado.

## Segurança antes do go-live

- [ ] Ativar 2FA para administradores.
- [ ] Revisar e limitar os e-mails administrativos.
- [ ] Conferir logs sem tokens, assinaturas ou dados de pagamento.
- [ ] Testar expiração, adulteração e reutilização de links.
- [ ] Testar duplicidade de checkout, webhook e retry.
- [ ] Validar retenção e exclusão de dados conforme LGPD.

## Publicação controlada

- [ ] Backup recuperável do banco.
- [ ] Migrations revisadas e ensaiadas no banco de teste.
- [ ] Build identificado por commit/digest.
- [ ] Plano de rollback documentado.
- [ ] Health check do backend e frontend após deploy.
- [ ] Smoke test de login, catálogo, link, checkout e painel administrativo.
- [ ] Monitorar erros e reservas por pelo menos uma janela operacional antes de liberar todos os afiliados.

Não executar pagamentos reais durante a homologação e não aplicar migrations diretamente na produção sem backup e aprovação explícita.

Estado atualizado em 27/11/2026. A consolidação da branch e dos checklists não constitui autorização de produção.
