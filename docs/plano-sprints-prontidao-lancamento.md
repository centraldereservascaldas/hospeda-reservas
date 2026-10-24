# Plano de sprints — prontidão para lançamento e tráfego pago

## Estado de partida e regras de execução

Este plano parte do estado observado em 24/10/2026. Há alterações locais extensas, inclusive no checkout e no frontend; elas precisam ser inventariadas antes de compor commits. O README registra checkout próprio ainda sem validação ponta a ponta, condições comerciais não aprovadas e `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED`, `DIRECT_BOOKING_CONFIRMATION_ENABLED` e `DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED` desligadas. Nenhum gate abaixo está presumido como concluído. Consulte também `roadmap-vendas-diretas.md`, `checkout-80-20-pilot-runbook.md`, `frontend-quality-plan.md` e `checklist-implementacao-coolify-hospeda-reservas.md`.

Cada pacote segue: escopo e critério → subagente implementador → subagente revisor independente → correção → verificação proporcional → commit temático. O revisor examina diff, contratos, segurança, estados de falha, acessibilidade e suficiência dos testes; o implementador resolve os achados antes do commit. Registrar comando, resultado e limitações no relato do pacote. Não incluir `.env`, segredos, caches, capturas temporárias nem artefatos locais. Não misturar correções alheias ao pacote. Commits são locais; push, deploy, ativação de cobranças reais e campanhas têm decisões e gates próprios.

## Sprint 0 — base auditável

**Objetivo:** transformar o worktree atual em uma base rastreável sem perder trabalho existente.

- Inventariar arquivos modificados e não rastreados por domínio; comparar com `HEAD`, identificar mudanças já validadas, trabalho incompleto e arquivos descartáveis.
- Revisar segredos, contratos `/api/*`, dependências e migrações. Separar commits por assunto, preservando alterações preexistentes e a possibilidade de reversão.
- Rodar verificações direcionadas e registrar falhas preexistentes antes de atribuí-las a um pacote: `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, testes Laravel relevantes, `git diff --check`.

**Aceite:** cada alteração local tem destino documentado (commit temático, pendência identificada ou descarte justificado); nenhum segredo ou arquivo temporário é versionado; cada commit aprovado possui evidência de revisão e verificação. O inventário é um gate para mexer nos mesmos arquivos nas sprints seguintes.

## Sprint 1 — regras comerciais e elegibilidade

**Dependência:** Sprint 0. **Objetivo:** permitir cotação e compra apenas sob condições aprovadas.

- Escolher de 2 a 5 imóveis piloto e aprovar por imóvel preço total, taxas, capacidade, check-in, cancelamento, suporte e meios de pagamento. Identificar o responsável pela aprovação comercial.
- Versionar as condições no mecanismo existente de termos; conferir apresentação no anúncio, resumo e checkout, bem como revalidação no servidor.
- Resolver o conflito entre prazo proposto de pré-reserva de 30 minutos e margem mínima de Pix de mais de 35 minutos, conforme o runbook e o código vigente; validar prazo com Stays e gateway.

**Aceite:** somente imóveis aprovados ficam elegíveis; valores e regras exibidos coincidem com os enviados ao backend; prazo de pagamento e expiração não se contradizem; testes cobrem rejeição de imóvel/condição inelegível e mudança de cotação. Aprovação comercial permanece gate humano explícito.

## Sprint 2 — checkout, pagamentos e recuperação

**Dependência:** Sprint 1. **Objetivo:** provar o ciclo de uma reserva em sandbox, incluindo falhas.

- Validar Pix e cartão, pedido idempotente, pré-reserva `reserved`, webhook, reconciliação, confirmação Stays, e-mail, retomada e expiração. Usar ambiente de teste isolado e dados fictícios.
- Cobrir aprovação, recusa, timeout, webhook ausente/duplicado, pagamento tardio, divergência financeira, cancelamento e reembolso; registrar procedimento para intervenção manual.
- Corrigir falhas e acrescentar testes de contrato/feature e smoke guiado onde a integração externa impede automação.

**Aceite:** nos cenários testados, pedido, gateway, Stays, e-mail e interface chegam a estados coerentes, sem cobrança ou confirmação duplicada; cada cenário tem evidência e responsável por exceções. Teste em sandbox não autoriza cobrança real.

## Sprint 3 — operação e candidato a publicação

**Dependência:** Sprint 2. **Objetivo:** tornar o serviço operável e reversível.

- Configurar e verificar e-mail transacional, worker, scheduler, logs sem dados sensíveis, alertas, conciliação e responsáveis por incidentes.
- Completar CI de backend e smoke dos caminhos críticos; validar migrações, HTTPS, variáveis, health check, backup e rollback conforme checklist de infraestrutura existente.
- Ensaiar falha controlada e restauração em ambiente não produtivo.

**Aceite:** uma reserva de teste conclui e uma exceção controlada chega ao responsável; health check e CI relevantes passam; rollback foi exercitado. **Gate de deploy:** revisão do candidato, ambiente, dados e plano de reversão; publicar somente após autorização de publicação. Publicação não liga cobrança real.

## Sprint 4 — privacidade e mensuração

**Dependência:** jornada de checkout e estados finais definidos nas Sprints 1–2. **Objetivo:** medir o funil com escolha de privacidade respeitada.

- Publicar textos de privacidade e termos aprovados, links funcionais e mecanismo de consentimento/recusa/revogação para tags não essenciais.
- Definir taxonomia e instalar GTM, GA4, Google Ads e Meta Pixel: busca, resultados, detalhe, início do checkout, escolha de pagamento e compra confirmada. Avaliar Conversions API depois de estabilizar eventos do navegador.
- Validar parâmetros de campanha, referência única, moeda e valor; testar duplicidade e bloqueio das tags conforme consentimento.

**Aceite:** uma reserva confirmada produz uma única conversão com ID, valor e BRL corretos; pré-reserva e Pix pendente não produzem `purchase`; recusa impede tags não essenciais e revogação funciona. Textos legais exigem aprovação de quem responde por privacidade e operação.

## Sprint 5 — conversão e usabilidade mobile

**Dependência:** funil instrumentado e checkout de teste estável. **Objetivo:** reduzir fricção desde anúncio até reserva.

- Executar tarefas observadas em 320/375/390 px, iPhone/Safari e Android/Chrome: busca, comparação, detalhe, cotação, autenticação quando aplicável e checkout. Registrar conclusão, tempo, erros e abandono por etapa.
- Priorizar problemas medidos na primeira tela, barras fixas, seleção de datas/hóspedes, preço total, formulários, teclado virtual e retomada. Revisar loading, vazio, erro e sucesso.
- Corrigir por hipótese e comparar antes/depois; seguir `frontend-quality-plan.md`, inclusive foco, Escape, leitor de tela e movimento reduzido.

**Aceite:** tarefas críticas são concluídas sem orientação nos aparelhos alvo; não há bloqueio de foco, rolagem ou teclado; mudanças têm evidência de melhoria ou eliminação de erro e testes proporcionais. Não declarar ganho de conversão com base apenas em impressão visual.

## Sprint 6 — aquisição, desempenho e estabilização

**Dependência:** Sprints 3–5 e gates externos aplicáveis. **Objetivo:** receber tráfego pequeno e mensurável com oferta coerente.

- Criar páginas/URLs de destino por campanha ou imóvel com título, descrição, conteúdo, canonical, prévia de compartilhamento e tratamento de inexistentes; conferir correspondência anúncio–destino–disponibilidade.
- Medir Core Web Vitals em mobile real, otimizar imagens e carregamento inicial conforme dados de campo; revisar acessibilidade e SEO técnico.
- Rodar smoke completo no endereço publicado, acompanhar funil, erros, pagamento e suporte; ampliar tráfego apenas após observar estabilidade.

**Aceite:** URLs públicas e metadados foram verificados; metas de desempenho são registradas com origem dos dados; reserva de teste percorre anúncio → página → checkout → confirmação com uma conversão; há rotina de monitoramento e critério de pausa. **Gate de cobrança real:** autorização comercial e operacional separada, credenciais e flags de produção revisadas, conciliação e suporte prontos, teste controlado autorizado. **Gate de campanha:** consentimento e medição validados, oferta e destino aprovados, orçamento/pausa definidos. Nenhuma dessas ativações decorre automaticamente de um commit ou deploy.

## Rastreamento

Em cada sprint, manter lista de itens com responsável, estado, evidência do aceite, revisão independente, commit e pendências. Se uma dependência externa impedir o aceite, registrar o bloqueio e prosseguir apenas em itens independentes; não marcar o gate como concluído por testes parciais.

### Progresso em 24/10/2026

| Pacote | Estado e evidência | Commit local |
| --- | --- | --- |
| Plano de sprints | Escopo, dependências e gates registrados. | `390b816` |
| CI do backend | Workflow de testes PHP para pull requests. | `32bfb55` |
| Ciclo do checkout | Guardas de pagamento, retomada e estados terminais; suíte PHP então com 47 testes e 265 asserções. Sem teste de pagamento ponta a ponta. | `a89a151` |
| Higiene do worktree | Artefatos locais ignorados; revisão de diff. | `b59a587` |
| Catálogo e simulador Stays | Revisão independente, filtro de cidades corrigido, testes focados 19/105 e suíte PHP 48/269 após o pacote. | `744620a` |
| Jornada frontend | Busca, detalhe, checkout e acessibilidade consolidados; risco de atualização do catálogo corrigido e revisto. Lint, Prettier, 330 testes e build passaram. | `1ccdff5` |
| Runtime em contêiner | SPA, CORS e variáveis públicas no build; testes direcionados 3/18 e rotas API verificadas. Build da imagem e smoke no contêiner pendentes por falta do Docker local. | `b082a65` |
| Detalhe Stays | 404 confirmado da Stays separado de falha 503; payload 200 malformado não gera anúncio fictício. Revisão independente e testes direcionados. | `5375aba` |
| Guardas comerciais da Sprint 1 | Todos os imóveis piloto configurados precisam de termos válidos; capacidade explícita da Stays menor que os hóspedes bloqueia pedido. Cotação singular sem ID permanece aceita para a única unidade consultada. Suíte PHP: 58 testes/314 asserções. | `bd466a9` |
| Primeira tela mobile | Busca compacta até 399 px; em smoke com simulador o primeiro cartão subiu de y=646 para y=291 em 375/390 px, sem overflow e com retorno de foco. Testes focados 22/22, lint e build passaram. | `c78f103` |
| Identificador de pagamento | ID vazio/zero rejeitado na criação, recuperação e processamento; sem confirmação indevida. Suíte PHP: 61 testes/348 asserções. Sem validação sandbox. | `0349fb4` |
| Readiness operacional | `/api/health` preservado como liveness; `/api/ready` verifica banco e dirige o healthcheck Docker. Testes 4/25; imagem ainda sem build local. | `c4c5fb0` |
| Consentimento técnico | Escolha inicial recusada, reabertura e revogação com foco testado; GTM só carrega com aceite e ID válido. Sem contêiner real e sem textos legais aprovados. | `479ce59` |
| E-mail de confirmação | Job recém enfileirado agora envia; reexecução sequencial não duplica. Suíte PHP 63/362. Falha de transporte e concorrência real seguem sem ensaio. | `649e697` |
| Evento de compra | `purchase` apenas com reserva e pagamento confirmados, BRL e valor válido; ID externo é hash não navegável, dedup local. Testes 6/6; plataforma real não validada. | `d375fd0` |
| URLs ainda não aprovadas | Checkout, reserva e detalhe entregues pelo Laravel recebem `noindex, nofollow`, inclusive com barra final; suíte PHP 64/400. Metadados por imóvel aguardam registro editorial aprovado. | `094822a` |
| Eventos do funil | `search`, `view_item`, `begin_checkout` e `add_payment_info` ligados às ações, sem texto livre/PII; teste StrictMode evita repetição de `view_item`. Suíte frontend 338/338, lint e build passaram. | `66df24a` |
| Falha de e-mail e retry | Teste cobre falha de transporte, espera de 30 s, recuperação e envio único após retry. Testes focados 2/25. | `1794f5d` |
| Janela de retry do e-mail | Teste cobre registros `failed` e `queued` com mais de 24 h, transição terminal e ausência de novo job. Revisão independente sem achados impeditivos; testes focados 3/29 e Pint passaram. Limite exato de 24 h e aceitação ambígua do provedor não foram ensaiados. | `c31f2a0` |
| Fonte local | Plus Jakarta Sans passou a ser servida com WOFF2 local e licença OFL; build/lint passaram e HTML gerado não referencia Google Fonts. Ganho real de Web Vitals não medido. | `79de6ea` |
| Alvos dos calendários mobile | Busca e detalhe mantêm sete colunas com alvos de aproximadamente 44 px entre 320–639 px; padding e espaçamento ajustados e teste de regressão atualizado. Testes focados 338/338, lint e `git diff --check` passaram; revisão independente confirmou a geometria CSS. | `9e4b3a5` |
| Impressão de resultados de busca | `view_item_list` mede IDs dos imóveis efetivamente exibidos, somente com consentimento e GTM carregado; bloqueia loading/erro/lista vazia, valida IDs e deduplica rerenders sem suprimir nova impressão após a lista desaparecer. Revisão independente sem achados; testes 340/340, ESLint, TypeScript e diff-check passaram. GTM/GA4 real ainda não configurados. | `3a099f6` |
| CTA persistente no detalhe mobile | CTA de reserva em portal fora do card recortado, integrado ao trap de foco/`aria-owns`, mantendo disabled/label coerentes e ocultando sob calendários, hóspedes e galeria. Revisão Luna sem achados bloqueadores; testes de detalhe 340/340, ESLint e diff-check passaram. Leitor de tela/navegador real pendente. | `b91f550` |
| CI de container | GitHub Actions constrói a imagem, aguarda `/api/ready` saudável com SQLite, confirma liveness/readiness e HTML + bundle JS da SPA; instância com banco indisponível deve ficar unhealthy e responder readiness 503. Revisão Luna aprovada; YAML e diff-check passaram. Docker indisponível localmente; execução real depende do primeiro workflow no GitHub. | `cac2e0b` |
| Cache do catálogo Stays | Catálogo mapeado cacheado por 300 s; lock coordena cache misses e `remember` revalida após lock; falhas upstream não são cacheadas, vazio live segue vazio em produção e usa fallback local em dev. Revisão Luna sem bloqueador; testes 22/22 (109 assertions) e Pint passaram. Em produção multi-host, o cache store deve compartilhar locks; a execução local de 5,93 s não foi comparada após mudança. | `bc97ad2` |
| Persistência server-side de atribuição | Checkout valida e armazena first/last touch e IDs de clique permitidos; replay idempotente preserva a primeira atribuição e campos extras são rejeitados. Revisão Luna sem bloqueador; testes de checkout 20/20, Pint e diff-check passaram. Valores UTM ainda podem carregar identificadores em formato slug, então a allowlist não garante ausência de PII. | `cc3ba0e` |
| Envio de atribuição no checkout | Cliente revalida consentimento no envio, filtra categorias revogadas e envia somente first/last touch aceitos pelo contrato backend, sem versão/expiração. Revisão Luna sem bloqueador; suíte frontend 347/347, lint, build e diff-check passaram. Taxonomia de campanhas continua proibindo dados pessoais por processo; nomes podem ser codificados em slugs. | `f911d71` |
| Formatação do baseline frontend | `npm run format:check` reprovava três arquivos existentes; apenas quebras de linha e indentação foram ajustadas. Revisão Luna confirmou diff exclusivamente de estilo e `npm run format:check` passou. | `ba6589c` |
| Limites de timestamp da atribuição | Backend e helper frontend aceitam epoch em milissegundos até 30 dias e toleram relógios até 5 min adiantados; limites exatos e atributo omitido/null cobertos. Revisão Luna sem achados; suíte PHP 73/467 e frontend 349/349, lint, build, format, Pint e diff-check passaram. | `7361a78` |
| Limiar da pré-reserva para Pix | Regressão confirma que 35 min (mínimo Pix 30 + margem 5) não escreve cliente/reserva na Stays; 36 min aceita e confirma `reserved` no fake. Revisão Luna sem achados; suíte PHP 75/481 e Pint passaram. Aprovação do prazo com Stays/gateway continua externa. | pendente de commit |
| Ingestão do webhook Mercado Pago | Testes de rota cobrem assinatura inválida sem persistência/dispatch, assinatura válida com persistência e `afterCommit` real na fila database, e entrega duplicada idempotente. Revisão Luna sem bloqueador; suíte PHP 78/503, Pint e diff-check passaram. A reconciliação do job e ciclo de cobrança seguem sem cobertura integrada. | pendente de commit |

**Sprint 0 ainda aberta:** separar atualização incidental de `composer.lock` e validar imagem Docker em ambiente com runtime. Os gates das Sprints 1–6 não estão aceitos. A escolha e aprovação comercial dos imóveis piloto, contratos e credenciais de sandbox são entradas externas ainda pendentes. Nenhuma cobrança real, publicação ou campanha foi ativada. O smoke mobile usou simulador local; uma consulta live expirou no navegador, mas uma medição posterior de `/api/accommodations` retornou HTTP 200 em 5,93 s com 142.578 bytes. A causa da intermitência ainda não foi atribuída; o código permite paginação e enriquecimento sequenciais sem cache entre requisições. A medição não ativa GTM real sem ID e aceite; compra não deve ser considerada validada em GA4, Google Ads ou Meta até configurar contêiner, checar consentimento das tags e testar deduplicação em browser/sandbox.
