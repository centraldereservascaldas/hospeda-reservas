# Checklist de aprofundamento do Design System

## Objetivo e limites

Evoluir o sistema visual do frontend principal do Hospeda Reservas com base em usos reais, cobrindo as jornadas dos painéis de usuário, proprietário e administração, além de investigar a existência e as regras de um painel de afiliado. Consolidar tokens e contratos reutilizáveis por etapas, ampliar a documentação viva em `/design-system` e verificar os consumidores afetados.

- **Incluído:** frontend React/TypeScript principal, componentes compartilhados, tokens globais, páginas internas e consumidores de API Laravel.
- **Fora do escopo:** blog Astro, rebranding, mudança de contratos/API, alteração de autorização no backend, dependências novas e publicação de biblioteca independente.
- **Proteção:** preservar diferenças reais entre domínios, permissões e tarefas; não usar contagem de componentes ou cobertura de tokens como prova de qualidade.
- **Estado inicial:** diagnóstico em andamento. As caixas abaixo não são declarações de conclusão.

## Convenções de evidência e ciclo de vida

Todo registro de token, padrão, componente ou painel deve ter uma destas situações, acompanhada de fonte e limite da evidência:

- [ ] **Observado:** encontrado em código ou interface renderizada. Registrar rota/estado, arquivo e método de observação.
- [ ] **Proposto:** candidato inferido de uma tarefa ou lacuna. Registrar premissas, razão, alternativa e decisão pendente.
- [ ] **Implementado:** presente em arquivo/revisão nomeados. Isso não prova validação.
- [ ] **Validado:** critérios específicos conferidos por método, ambiente e revisão/data; registrar resultados e limites.
- [ ] **Em descontinuação:** consumidor conhecido, substituto, migração, responsável e condição de remoção identificados.

Não transformar ausência em prova de inexistência: indicar o escopo da busca, tipos de arquivo, aliases e limites. Não chamar uma amostra estática de fluxo funcional, componente compartilhado de componente adotado em todo lugar, ou revisão especializada de validação com usuários.

## Inventário inicial de superfícies

| Superfície                       | Evidência inicial                                                                                                                                   | Status e limites                                                                                                                                 | Próxima verificação                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conta e viagens do usuário       | `src/components/account/GuestAccountModal.tsx`, `src/components/account/WishlistsView.tsx`, `src/components/booking/TripsView.tsx`                  | **Observado no código**. Estados, permissões e renderização precisam de walkthrough por tarefa.                                                  | Mapear acesso, login, recuperação, listas, reservas, cancelamento, erro e retorno à exploração.                                                                     |
| Painel do proprietário/anfitrião | `src/components/owner/HostDashboardView.tsx`, `src/components/owner/OwnerAccountingTransactions.tsx`, `src/components/owner/CreateListingModal.tsx` | **Observado no código**. Inclui visão geral, imóveis, reservas, calendário e contabilidade; precisa confirmar composição e estados renderizados. | Mapear filtros, período, seleção de imóvel, calendário, contabilização, criação, vazio, loading e falha.                                                            |
| Administração                    | `src/components/owner/OwnerAccessAdminView.tsx`; pontos de composição/autorização em `src/components/MainContentRouter.tsx` e `src/App.tsx`         | **Observado no código**. Há acesso administrativo de proprietário e uma capacidade condicional de operação de pagamentos.                        | Separar tarefas por permissão; mapear filas, busca, paginação, ações destrutivas/consequenciais e recuperação.                                                      |
| Operação de sandbox parceiro     | `src/components/booking/PartnerSandboxOperations.tsx`, rotas sob `owner/admin/partner-sandbox`                                                      | **Observado como ferramenta interna de sandbox**, não classificado como painel de afiliado nem painel administrativo geral.                      | Manter fora da taxonomia de afiliado até confirmação do domínio e finalidade.                                                                                       |
| Painel de afiliado               | Busca estática por `affiliate`/`afiliad` em `src` não encontrou uma tela ou componente dedicado; há menções a sandbox e `partnerCode` de reserva.   | **Desconhecido**, não “inexistente”. Uma busca textual não cobre todos os caminhos, nomes ou dados dinâmicos.                                    | Procurar rotas, autorização, API, termos de produto e fluxo de comissão. Se não houver evidência de negócio, registrar fora de escopo em vez de inventar dashboard. |

### Gates de acesso observados no código

- `HostDashboardView` só é composto em `MainContentRouter` quando `currentView === 'host'`, `ownerAccessStatus === 'approved'` e existe `accessToken`.
- `OwnerAccessAdminView` só é composto com `currentView === 'ownerAdmin'`, `isOwnerAdmin` verdadeiro e `accessToken`; a seção de operação financeira depende adicionalmente de `canManagePayments`.
- `/design-system` é exibido sem gate em `import.meta.env.DEV`; fora de desenvolvimento, `App.tsx` exige `ownerAdminAccess === 'approved'` e mostra fallback de acesso restrito nos demais estados.
- `ownerAdminAccess` e `canManagePayments` são derivados de `getOwnerAdminStatus(accessToken)` em `useAccountWorkspaceData`; falha/negação remove a visão administrativa. Esta leitura confirma composição client-side observada, não substitui a autorização independente da API.
- `TripsView` e `WishlistsView` são selecionadas pela navegação principal sem exigir admin; viagens exibem gate de conta dentro da tela quando deslogado.
- Uma busca textual por `affiliate`/`afiliad` em `src`, `app` e `routes` não localizou módulo de afiliado. `partner-sandbox` em `routes/api.php` e previews em `src/App.tsx` são superfícies de teste de checkout/operação; essa evidência não confirma nem descarta um programa de afiliados fora desses nomes.

### Componentes e tarefas observados nos painéis

Este é um mapa estático de pontos de entrada/estrutura de código, não uma validação de todos os estados no navegador. A busca inicial cobriu arquivos nomeados abaixo, com consultas textuais por controles e semântica; aliases, componentes indiretos e estados gerados em runtime podem não aparecer. Não é uma contagem exaustiva do produto.

| Área          | Tarefas e famílias localizadas                                                                                                                                                                                   | Arquivos principais                                                                                                                                 | Lacunas de evidência                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usuário       | Autenticar/recuperar conta (`GuestAccountModal`); criar/acessar listas e favoritos (`WishlistsView`); acompanhar, filtrar por estado, abrir detalhes/voucher e solicitar cancelamento de reservas (`TripsView`). | `src/components/account/GuestAccountModal.tsx`, `src/components/account/WishlistsView.tsx`, `src/components/booking/TripsView.tsx`                  | Walkthrough visual pareado de visitante autenticado/deslogado, loading, erro, vazio, cancelamento e foco/retorno dos diálogos.                                   |
| Proprietário  | Resumo de dados, selecionar imóvel/período, navegar imóveis/reservas/calendário/contabilidade, exportar CSV, inspecionar lançamento e bloquear datas.                                                            | `src/components/owner/HostDashboardView.tsx`, `src/components/owner/OwnerAccountingTransactions.tsx`, `src/components/owner/CreateListingModal.tsx` | Conferir estados com dados permitidos e janela grande/estreita; a tabela contábil tem largura mínima de 850 px e precisa de avaliação da experiência de rolagem. |
| Administração | Rever pedidos de acesso; quando permitido, tratar pedidos/webhooks em conferência, paginação, falhas e ações de operação; consultar proprietários Stays.                                                         | `src/components/owner/OwnerAccessAdminView.tsx`, `src/components/MainContentRouter.tsx`, `src/App.tsx`                                              | Walkthrough por capacidade, impacto e permissão; revisar ações repetíveis, resultado incerto, confirmação e trilha operacional sem alterar regras de servidor.   |
| Afiliado      | Nenhuma tarefa de dashboard confirmada no frontend. `partnerCode` é exibido em resumo de reserva e rotas de sandbox têm finalidade de teste/operação.                                                            | `src/components/booking/ExistingReservationStayCard.tsx`, `src/components/booking/PartnerSandboxOperations.tsx`, `src/App.tsx`                      | Descobrir modelo de afiliado, papéis, vínculo, atribuição, comissão, repasse e API antes de definir métricas, tabelas ou ações.                                  |

## Wave 0 — enquadrar e auditar

- [x] Confirmar escopo Laravel/React principal e excluir Astro.
- [x] Ler workflow de Design System, auditoria de componente, fundação visual e skill local de implementação.
- [x] Confirmar branch e alterações pré-existentes; preservar arquivos alheios ao escopo.
- [x] Consultar o checklist e o inventário de motion/layout existentes antes de propor tokens.
- [x] Extrair do squad Design Markman os checklists de auditoria (`ds-pattern-audit-checklist.md`), mapeamento de tokens (`token-mapping-checklist.md`), qualidade de componentes (`ds-component-quality-checklist.md`), migração (`ds-migration-readiness-checklist.md`), gate de acessibilidade (`ds-a11y-release-gate-checklist.md`) e protocolo de governança/execução; registrar origem e adaptações.
- [x] Conferir no código a composição, os gates e a dependência de token dos painéis de proprietário/admin; não alterar permissões.
- [ ] Revisar telas e estados renderizados representativos por painel; registrar viewport, ambiente, caminho e estados não alcançados.
- [x] Distinguir padrão repetido, variação intencional e exceção local em um piloto: apresentação do badge se repete entre jornadas, mas a semântica/tom permanece definida por cada domínio.

## Wave 1 — mapa de tokens e fundamentos

- [ ] Inventariar valores globais e consumidores em `src/index.css`, `public/brand-theme.css` e nos painéis em escopo.
- [ ] Mapear primitivas existentes separadas de papéis semânticos: cores, tipografia, espaçamento/layout, dimensões de controles, raios/bordas, superfícies/sombras/camadas, ícones, movimento e breakpoints relevantes.
- [ ] Para cada token candidato, registrar nome, significado, valor/fonte, plataforma/tema, consumidores encontrados, estado do ciclo de vida, contraste/restrições e nota de migração.
- [ ] Conferir o papel semântico em estados reais: padrão, foco, selecionado, desabilitado, carregando, erro e sucesso, quando aplicáveis.
- [ ] Evitar consolidar valores numericamente próximos com papéis diferentes; não sobrescrever a escala-base do Tailwind sem evidência e piloto.
- [ ] Manter explícitos os itens observados, candidatos propostos, decisões aprovadas, código implementado e estados validados.
- [ ] Pilotar uma família e consumidores representativos antes de migração ampla; registrar reversão e incompatibilidades.

### Evidência inicial de tokens observados

Leitura estática de `src/index.css`, `public/brand-theme.css`, `public/discovery.css` e busca textual em `src`/`public`. A evidência abaixo identifica declarações e referências textuais, não comprova cascata final, contraste contextual ou todas as classes geradas.

| Registro                 | Valor/contrato observado                                                     | Consumidor ou evidência                                                                                                        | Situação e decisão em aberto                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Acento da marca          | `--crcn-accent: #ea580c`                                                     | `public/brand-theme.css`; `public/discovery.css` usa no foco                                                                   | Observado. A semelhança com `--color-focus-ring` não prova equivalência de papel.                                        |
| Foco visível             | `--color-focus-ring: var(--crcn-accent)`; valor computado esperado `#ea580c` | `src/index.css` aplica contorno em foco; acento fonte em `public/brand-theme.css`                                              | Implementado como alias semântico curto. Validar valor computado e contraste em consumidores antes de migração ampla.    |
| Halo/borda de foco       | `--color-focus-ring-soft: #ffedd5`; `--color-focus-border: #fb923c`          | Definidos em `src/index.css`; candidatos para rings/borders repetidos no painel de proprietário/admin                          | Implementados, ainda sem consumidor migrado. Conferir contraste/estados reais e substituir utilitários gradualmente.     |
| Fundo da página          | `--crcn-color-page` e `--color-page`, ambos `#fff`                           | Primeiro em `public/brand-theme.css` e usado por `public/discovery.css`; segundo em `src/index.css` e usado por regras globais | Há dois nomes/fontes com mesmo valor. Determinar boundary de folhas e consumidores antes de alias ou migração.           |
| Borda glass              | `--crcn-glass-border` e `--color-glass-border`, ambos `rgba(148,163,184,.3)` | `public/discovery.css` e utilitários globais de `src/index.css`, respectivamente                                               | Há nomes duplicados por folha/escopo. Investigar se sistemas de superfície devem compartilhar contrato.                  |
| Superfície glass         | Gradiente em `--crcn-glass-surface`                                          | `public/brand-theme.css`; usada em `public/discovery.css`                                                                      | Observado em descoberta. Relevância e acessibilidade por painel ainda desconhecidas; não generalizar automaticamente.    |
| Estados do calendário    | Range, foreground, muted e unavailable em `@theme`                           | `src/index.css`                                                                                                                | Tokens de domínio observados. Validar estados do calendário e contrastes reais.                                          |
| Caption                  | `--text-caption: 0.75rem` com line-height `1rem`                             | Definido em `src/index.css`; adoção precisa ser conferida nos consumidores                                                     | Observado; não estabelece mínimo global de texto.                                                                        |
| Layout de busca/header   | Larguras, gutter, gaps e dimensões por componente em `:root` e media queries | `src/index.css`; lista ampliada em `docs/design-system-layout-audit.md`                                                        | Observados e específicos de busca/header. Não transportar como tokens gerais de painel sem repetição e propósito comuns. |
| Espaço e raio primitivos | Escala Tailwind 4 baseada em `--spacing: 0.25rem`; raios do tema             | Auditoria em `docs/design-system-layout-audit.md`                                                                              | Base existente observada; decidir papéis semânticos só depois de validar consumidores.                                   |
| Movimento                | Utilitários/transições locais e regras de movimento reduzido                 | `src/index.css`; inventário em `docs/design-system-motion-audit.md`                                                            | Inventário observado; duração/easing sem escala compartilhada aprovada.                                                  |

- [x] Registrar este inventário inicial com valores, fontes, referências textuais localizadas e perguntas de consolidação. Fonte adicional: `docs/design-system-layout-audit.md` para utilities/raios e `docs/design-system-motion-audit.md` para motion.
- [ ] Inspecionar cascata computada e estados renderizados antes de afirmar equivalência entre nomes de token ou aprovar migração.

## Wave 2 — inventário e contratos de componentes

Para cada candidato compartilhado ou de domínio:

- [ ] Registrar ID, tarefa, painel/rota, arquivo de origem, consumidores e evidência.
- [ ] Definir propósito, anatomia, conteúdo, props/slots, variantes, composição e limites de uso.
- [ ] Dizer se a semântica, teclado, validação e adaptação responsiva pertencem ao componente ou ao consumidor.
- [ ] Cobrir estados relevantes: inicial, loading, vazio, erro, sucesso, disabled, focus, permissão, redução de movimento e recuperação.
- [ ] Definir uso adequado, uso a evitar, alternativas nativas, diferenças legítimas e eventual migração/depreciação.
- [ ] Verificar semântica HTML, nomes/labels, teclado, foco, contraste contextual, zoom/reflow, touch, localização e conteúdo longo.
- [ ] Mapear componente visual/documentado à implementação, tokens, props, estados e consumidores reais; registrar lacunas e diferenças intencionais.

### Prioridade de trabalho acordada

Esta sequência prioriza as lacunas fundamentais identificadas nos painéis. Cada família passa primeiro por inventário de consumidores e comparação de contratos; só então decide-se entre reutilizar, compor um padrão de domínio ou criar uma primitiva compartilhada.

1. **[x] Busca e filtros de painel — auditoria concluída, sem abstração universal:** busca textual, filtros ativos, limpeza, seleção de imóvel e período. Comparados com `SearchModal`, `FilterModal`, `ActiveSearchFilters` e seletores existentes; diferenças e consumidores estão registrados abaixo.
2. **[~] Tabelas e listas de dados — auditoria em andamento, paginação compartilhada:** toolbar, cabeçalho, ordenação, paginação/seleção quando existirem, estados vazios/erro e apresentação estreita. Não converter a tabela de contabilidade numa tabela genérica sem preservar a leitura financeira.
3. **[x] Cartões de métricas — auditoria concluída, componente permanece no domínio:** valor, rótulo, período/contexto e estados de carregamento/indisponibilidade. O `Metric` local do dashboard do proprietário é evidência de composição, não prova de necessidade comum nos outros painéis.
4. **Diálogos de confirmação:** cancelamentos e ações administrativas/financeiras; semântica modal, nome acessível, foco inicial/retorno, Escape, consequência, ação segura e resultado incerto conforme o fluxo existente.
5. **Skeletons e carregamento:** distinguir carregamento inicial de atualização, preservar estrutura aproximada do conteúdo e respeitar movimento reduzido. Verificar os skeletons do catálogo como referência, sem presumir encaixe em painéis.
6. **Feedback de resultado da ação:** sucesso, falha e resultado incerto para salvar, cancelar, exportar ou operar. Escolher inline, persistente ou temporário conforme contexto e necessidade de recuperação; `InlineNotice` é uma peça existente, não decisão global de posicionamento.

Para cada família, registrar rota/tarefa, arquivos e consumidores, contrato/estados, diferenças por domínio, teclado/semântica, reflow e validação real. A ordem organiza o trabalho, mas evidência de dependência pode ajustar a sequência.

Famílias adicionais a avaliar depois das seis prioridades, sem obrigação de criar todas:

- [ ] Estrutura e navegação de painel: shell, navegação de seção, título/contexto, breadcrumb ou localização, abas versus navegação, ações de página.
- [ ] Resumo e dados: cartão de métrica, tendência quando houver dados válidos, tabela/lista, paginação, filtros, intervalo de datas, seleção de imóvel e estados sem dados.
- [ ] Entrada e edição: campo, seletor, formulário, validação, resumo de erros, upload/editor apenas se o fluxo existente exigir.
- [ ] Feedback e tarefa: aviso, badge de estado, loading/skeleton, vazio, falha/retry, confirmação, progresso e notificação apenas quando houver necessidade observada.
- [ ] Decisões consequenciais: confirmação/cancelamento, ações financeiras ou administrativas, permissão e trilha de auditoria, respeitando as regras existentes.
- [ ] Especializados: calendário/disponibilidade, finanças/lançamentos, reserva e gestão de anúncios, mantendo semântica de domínio quando não for generalizável.

### Piloto de token de foco

- **Implementado, validação pendente:** `src/index.css` agora define `--color-focus-ring` a partir de `--crcn-accent` e acrescenta `--color-focus-ring-soft: #ffedd5` e `--color-focus-border: #fb923c` como papéis Tailwind semânticos.
- **Consumidores observados:** `--color-focus-ring` já era usado pelo foco global; `ring-orange-100`/`ring-orange-200` e `focus:border-orange-400` aparecem em controles dos painéis de proprietário/admin e contabilidade.
- **Próximo passo:** migrar uma família de controles focáveis para os novos nomes preservando valores visuais; conferir CSS compilado, contraste sobre superfícies reais, foco de teclado e consumidores responsivos antes de ampliar.
- **Limite:** definições sem consumidor ainda são tokens implementados, não prova de consolidação/adopção. A escala Tailwind de espaço/raio permanece primitiva; sem aliases genéricos adicionais neste piloto.

Primitivas já identificadas no catálogo, cuja adoção e validação devem ser reavaliadas por consumidor: `Button`, `FormField`, `InlineNotice`, `StatusBadge` e `EmptyState`.

### Auditoria da prioridade 1: busca e filtros

| Padrão observado                 | Tarefa e consumidores                                                                                                                                                                       | Contrato/estado encontrado                                                                                                                                  | Decisão                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critérios ativos do catálogo     | `ActiveSearchFilters.tsx`: remover destino, datas, hóspedes, categoria, preço, tipo e comodidades; limpar filtros restaura foco para critério remanescente ou acionador.                    | Chips de viagem e filtros de imóvel têm semânticas próprias; botão de remoção tem nome acessível; comportamento e dados seguem `SearchFilters`.             | **Manter especializado em busca do catálogo.** Não reutilizar no painel, que não expõe esse conjunto de critérios.                                                                                    |
| Filtros do proprietário          | `HostDashboardView.tsx`: seletor de propriedade em reservas/contabilidade, navegação por mês no cabeçalho; calendário e bloqueio de datas têm seleção própria.                              | Seletor altera o recorte da coleção; período é mês no painel. Seleção do anúncio para bloqueio é entrada de operação, não filtro.                           | **Não unir seletor, navegação mensal e bloqueio.** Todos têm tipos de dado, contexto e resultado diferentes.                                                                                          |
| Filtros contábeis                | `OwnerAccountingTransactions.tsx`: anúncio, créditos e débitos; período chega do painel e define os resultados/CSV.                                                                         | `select` nativo e checkboxes dentro de `fieldset`/`legend`; lista vazia comunica ausência de lançamentos para aquele recorte.                               | **Manter como toolbar de domínio.** Reutilizar primitivas de campo/controle se o contrato se encaixar, mas preservar filtro financeiro e período.                                                     |
| Busca de cadastro Stays          | `OwnerAccessAdminView.tsx` → `OwnerRequestCard`: consulta textual após 2 caracteres, debounce de 300 ms, estado pesquisando/vazio/erro, resultados acionáveis por botão com `aria-pressed`. | Busca remota por nome/ID e associação de proprietário; seleção limpa quando o texto muda; erro hoje compartilha estado com validação/operação de aprovação. | **Não reutilizar autocomplete do catálogo sem comparação.** Candidato a `SearchInput` só se surgir outro consumidor com debounce, resultados e seleção equivalentes. Manter específico até confirmar. |
| Controles de busca da hospedagem | `SearchModal`, `FilterModal`, `ActiveSearchFilters`, `SearchPagination`.                                                                                                                    | Busca de estadia e filtros de imóvel; filtros se aplicam às acomodações carregadas, paginação tem estado incremental próprio.                               | **São referências existentes, não componentes de dashboard.** Evitar expor semântica de hospedagem nos painéis.                                                                                       |

- **Resultado desta prioridade:** auditoria estática e decisão de arquitetura concluídas; não criar um componente `FilterBar` universal porque os papéis observados não compartilham persistência, conjunto de critérios, comportamento assíncrono nem retorno de foco.
- **Primitiva candidata:** `FormField` já compõe label, hint, erro e `aria-describedby`, mas os controles atuais de painel têm labels nativos e requisitos visuais de toolbar distintos. Adotar somente em novos campos ou migração visualmente compatível, sem trocar semântica nativa.
- **Ainda não validado:** painéis autenticados e dados reais não foram renderizados nesta rodada; comportamento descrito foi localizado em código. O fluxo Stays remoto requer sessão/dados autorizados para validar debounce, falha e seleção no browser.

### Auditoria da prioridade 2: tabelas, listas e paginação

| Padrão observado                        | Tarefa e consumidores                                                                                          | Contrato/estado encontrado                                                                                                                                                                         | Decisão                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumo financeiro responsivo por imóvel | `HostDashboardView.tsx`: créditos/débitos por propriedade.                                                     | Cartões `dl` em telas estreitas; tabela semântica com cabeçalhos e linha de total em `sm+`; tabela desktop tem `min-width: 520px` dentro de `overflow-x-auto`.                                     | **Preservar apresentação específica.** Não trocar por tabela genérica nem forçar rolagem em telefone, pois o produto já apresenta a mesma informação em cartões.                      |
| Lançamentos financeiros                 | `OwnerAccountingTransactions.tsx`: conciliação, leitura por colunas, totais, detalhes em modal, CSV/impressão. | `<caption>` sr-only, cabeçalhos semânticos, moeda alinhada à direita e tabela de `min-width: 850px` com rolagem horizontal; vazio contextual aos filtros.                                          | **Manter tabela de domínio.** Auditoria futura deve conferir indicação de rolagem/zoom e largura estreita; sua semântica de colunas e total não se generaliza para listas de cartões. |
| Filas operacionais paginadas            | `OwnerAccessAdminView.tsx`: notificações sem pedido vinculado e pedidos em conferência.                        | Cartões de operação, labels de navegação próprios, total/página, anterior/próxima e desabilitação no limite ou durante loading. As duas paginações repetiam estrutura, ações, classes e semântica. | **Extrair controle de página compartilhado**, mantendo cartões, contagem contextual, query e estado separados por coleção.                                                            |
| Reservas e listas de usuário            | `TripsView.tsx` e `WishlistsView.tsx`.                                                                         | Coleções em cartão/lista, filtros de status de reserva e estados vazios; não são tabelas de dados tabulares.                                                                                       | **Manter apresentação de tarefa.** Não representar cards como grid ARIA nem reutilizar paginação de servidor sem evidência de necessidade/contrato.                                   |

#### Contrato implementado: `PagePagination`

- **Fonte/consumidores:** `src/components/PagePagination.tsx`, usado pelas filas de notificações e pedidos em `OwnerAccessAdminView.tsx`; espécime interativo no catálogo `/design-system#proprietario`.
- **Responsabilidade:** renderizar `<nav>` nomeado, resumo de quantidade/página anunciado educadamente, anterior/próxima, clamp dos limites de página e disable enquanto busy. `countLabel` fornece o nome contextual; estado servidor e navegação permanecem com o consumidor.
- **Estados relevantes:** primeira página, última página, página única, loading e rótulo de contagem; não faz fetch, não persiste query, não assume número máximo de páginas ou comportamento de tabela.
- **Acessibilidade/responsivo:** botões nativos em ordem anterior/próxima, nomes visíveis, ícones decorativos ocultos, foco visível e layout flexível que quebra linha em espaço estreito.
- **Validação técnica e visual:** ESLint direcionado, `npx tsc --noEmit -p tsconfig.frontend.json`, `npx vite build`, Prettier e `git diff --check` passaram. O espécime do catálogo avançou de página 1 para 2 por teclado/browser control e não gerou overflow horizontal em viewport de 390 px.
- **Limite de evidência:** o espécime confirma o componente, não a integração das filas reais; elas requerem sessão administrativa e dados controlados para validar navegação, atualização server-side e anúncio de estado. O browser registra falhas de CORS ao catálogo Laravel em `127.0.0.1:8000`; não são originadas pelo componente de design system.
- **Decisão sobre tabela genérica:** nenhum wrapper/tabela universal foi criado. Dois consumidores tabulares têm esquemas e soluções mobile diferentes; as filas administrativas são cartões, não tabelas. Reavaliar quando outra tela repetir o contrato financeiro ou receber tabela comparável.

### Auditoria da prioridade 3: cartões de métricas

- **Observado:** `HostDashboardView.tsx` contém `Metric` para quatro valores da visão geral (propriedades vinculadas, reservas confirmadas, créditos e débitos) e `AmountCard` para créditos/débitos/saldo por propriedade. Os dois são componentes locais ao domínio e têm anatomias e tons diferentes.
- **Busca cruzada:** `rg` por `Metric`/`AmountCard` em `src/components/**/*.tsx` localizou apenas essas definições/usos no painel do proprietário. O painel administrativo expõe contagens dentro das filas paginadas, sem conjunto equivalente de métricas; conta e viagens de usuário não apresentam dashboard numérico; painel afiliado ainda não tem jornada confirmada.
- **Decisão:** manter `Metric` e `AmountCard` locais. Não criar `MetricCard` compartilhado sem segundo consumidor ou necessidade de produto comparável. A documentação `/design-system#proprietario` agora mostra as duas composições observadas e o inventário classifica-as como **observadas**, não como primitivas globais.
- **Contrato local registrado:** `Metric` recebe `label`, `value` e `icon`; `AmountCard` recebe `label`, `value` e tom `emerald | orange | neutral`. Contexto/período vem do painel; interpretação dos valores e do tom permanece no domínio financeiro.
- **Estados não cobertos no espécime:** ausência de dado, valor indisponível e carregamento são tratados pelo estado global da tela, não nesses cartões. Validar se a semântica comunica dados incompletos antes de promover qualquer variante.

### Piloto de contrato: campo de conta

- **Observado:** `GuestAccountModal.tsx` repetia label, ID, marcação required, campo e dica de senha em login/cadastro/recuperação. `FormField.tsx` já compõe label, required, hint/error e `aria-describedby`; `GuestDetailsForm.tsx` já o usa no checkout.
- **Decisão:** adotar o wrapper para autenticação sem mover validação, estado, nomes de autocomplete, submissão ou IDs; deixar estilo visual do controle no consumidor. A dica de senha passa a ser associada programaticamente ao input.
- **Implementado nesta wave:** `GuestAccountModal.tsx` usa `FormField` nos campos de nome, e-mail e senha nos modos aplicáveis, incluindo recuperação; o catálogo passou a registrar conta e checkout como consumidores.
- **Validado em escopo restrito:** navegador local, estado de cadastro em 1280 px e 390 × 844 CSS px. DOM confirmou IDs preservados, labels correspondentes, três campos required e dica da senha ligada por `aria-describedby`; documento sem overflow horizontal.
- **Ainda não validado:** submissão de login/cadastro/recuperação, respostas reais do backend, conteúdo de erro, teclado/VoiceOver e viewport de altura curta. A inspeção não acionou autenticação.

### Piloto de contrato: badge de status da reserva

- **Observado:** `HostDashboardView.tsx` compõe `StatusBadge` com `warning`, `success`, `danger`, `neutral` e `info`, com mapeamento próprio de reserva/pagamento. `TripsView.tsx` repetia um badge âmbar/verde local para reserva que exige atenção versus confirmada.
- **Decisão:** reutilizar `StatusBadge` na coleção de próximas viagens e manter a decisão de tom no domínio da reserva. O componente compartilhado fornece apresentação; não é responsável por interpretar status financeiros, operacionais ou de reserva.
- **Implementado nesta wave:** `src/components/booking/TripsView.tsx` usa o primitivo para status de viagens ativas, concluídas e canceladas, preservando os textos, ícones e distinção de cores anteriores. A semântica dos pedidos de compra continua local porque reúne vários estados operacionais e financeiros com significado próprio. O catálogo interno e este mapa registram o consumidor.
- **Evidência visual disponível:** smoke local em viewport 390 × 844 CSS px mostrou a tela de reservas e o gate de conta para sessão deslogada. A lista de viagens ativas não fica disponível sem autenticação; essa visita não verificou o badge migrado. A página inicial também informou indisponibilidade do catálogo/API local.
- **Ainda não validado:** equivalência visual no navegador com dados de reserva permitidos, todos os estados, zoom e leitor de tela. Confirmar no consumidor após as verificações desta tranche; não registrar o gate deslogado como teste do estado autenticado.

### Piloto de contrato: aviso de falha de carregamento em painéis

- **Observado:** `HostDashboardView.tsx` e `OwnerAccessAdminView.tsx` apresentam erros de carregamento em alertas inline. No proprietário, o alerta também oferece retry; no admin, alertas por pedido/notificação comunicam riscos operacionais locais.
- **Decisão:** usar `InlineNotice` apenas nos erros gerais de carregamento/requisição das páginas/filas. Preservar o retry dentro do conteúdo no dashboard do proprietário e manter alertas por pedido no componente de operação, pois carregam instruções e consequências próprias.
- **Implementado nesta wave:** os erros gerais do dashboard do proprietário e as duas filas de `OwnerAccessAdminView.tsx` usam `InlineNotice` com `role="alert"`. A ação de retry e os callbacks permanecem nos consumidores.
- **Ainda não validado visualmente:** as telas administrativas exigem sessão e dados apropriados, indisponíveis no smoke local desta rodada. Build/lint confirmam compilação e tipos, mas não verificam falha real de API, repetição do retry ou experiência de leitor de tela.

### Piloto de contrato: confirmação de ação administrativa

- **Observado:** `OwnerAccessAdminView.tsx` usava `window.confirm` para recusar pedido de acesso e revogar link de retomada. Os dois fluxos descrevem consequências diferentes; as reservas de usuário e o encaminhamento de cancelamento manual já usam diálogos próprios.
- **Decisão:** compartilhar apenas a anatomia e o comportamento de foco/pendência/erro por `ConfirmationDialog`; manter título, consequência, texto de ação e regra de operação no consumidor.
- **Implementado nesta wave:** `src/components/ConfirmationDialog.tsx`, usando `Button` e `useDialogFocus`. Os dois consumidores administrativos agora mostram consequência explícita, foco inicial no botão menos destrutivo, Escape/Cancelar quando o envio não está pendente, estado pendente sem repetição da operação e erro recuperável dentro do diálogo. O componente recebe uma referência estável ao contêiner administrativo como fallback de retorno de foco se a atualização remover o cartão.
- **Consumidores:** `DirectBookingOperationsCard` revoga apenas a credencial de retomada; `OwnerRequestCard` recusa uma solicitação de acesso.
- **Validação técnica:** ESLint direcionado, `npx tsc --noEmit -p tsconfig.frontend.json`, `npx vite build`, Prettier e `git diff --check` passaram. `/design-system#overlays` inspecionado no navegador a 390 px sem overflow; tokens calculados no browser retornaram os três valores esperados. O espécime do catálogo é ilustrativo, não exercita o componente real.
- **Limites:** não alteramos API nem autorização. O componente não substitui o diálogo de cancelamento da reserva e não resolve todo padrão modal do sistema. Inspeção dos diálogos reais, teclado, zoom, leitor de tela e falhas reais de API ainda precisam de validação autenticada.

## Wave 3 — priorizar e implementar por painel

### Revisão dos dropdowns e seletores

- **Escopo estático:** frontend React/Laravel, sem blog Astro. Há 12 elementos `<select>` em oito arquivos: nove instâncias de produto, uma do sandbox e duas amostras do Design System. Consumidores de produto: `MercadoPagoCardForm.tsx` (banco, parcelas e documento), `CieloSopCardForm.tsx` (parcelas), `CreateListingModal.tsx` (categoria), `HostDashboardView.tsx` (propriedade e filtro), `OwnerAccountingTransactions.tsx` (propriedade) e `ParkTicketSelector.tsx` (data da visita). `PartnerSandboxCheckout.tsx` é superfície de sandbox.
- **Seletores customizados:** `LiquidSelect` em `StaysSearchWidget.tsx` atende condomínio e hóspedes. No popover compacto, busca, navegação por setas/Home/End, seleção, Escape, foco e estado vazio estão presentes. No painel compartilhado do hero, o contrato estava incompleto; foi alinhado com o ID do diálogo e do listbox, navegação por teclado e retorno de foco ao acionador no Escape, além de resultado vazio/carregamento.
- **Parcelamento:** `InstallmentPicker.tsx` é um listbox de seleção única com setas, Home/End, Escape, Enter/espaço, foco de retorno, disabled e opções ausentes. Consumidores incluem checkout Cielo e pagamento de reserva existente. O formulário Mercado Pago recebe seus campos de seleção via SDK do provedor e requer nova validação quando o SDK/integração mudar.
- **Painéis do cabeçalho:** moeda e conta são grupos de botões comuns, não menus ARIA. Removemos `aria-haspopup="true"` genérico; a moeda expõe escolha ativa com `aria-pressed`. Escape, clique externo e retorno de foco já eram tratados. Calendário, contador de hóspedes, disclosures e diálogos de data/ocupação continuam padrões separados.
- **Documentação viva:** `/design-system#formularios` agora lista as instâncias nativas e os contratos customizados, incluindo a separação entre dropdowns de seleção e outros painéis.
- **Evidência/limites:** inventário feito por busca estática no código; não representa prova visual de cada fluxo autenticado. Pagamentos e dados de proprietário/admin pedem sessão controlada para revisão visual com dados reais. Não convertemos os selects nativos em widgets customizados, pois não há repetição ou necessidade funcional comprovada que justifique perder comportamento nativo.

### Usuário

- [ ] Mapear conta/login/recuperação, favoritos/listas, viagens/reservas, detalhes, cancelamento e retorno à descoberta.
- [ ] Comparar controles e padrões de estado com as primitivas existentes antes de abstrair.
- [x] Pilotar `FormField` nos campos de login/cadastro/recuperação e `StatusBadge` nas reservas de usuário usando primitivas existentes, preservando estado/regra de domínio.
- [x] Pilotar mudanças de apresentação sem modificar regras de cancelamento, sessão, reserva ou checkout.

### Proprietário

- [ ] Mapear navegação overview/propriedades/reservas/calendário/contabilidade, filtros, período e contexto do imóvel.
- [ ] Auditar contrato visual para tabelas/listas, métricas, valores monetários, status, calendário, seleção, ações e feedback.
- [ ] Separar dados ausentes, zero, erro, carregamento e ausência de permissão.
- [x] Pilotar `InlineNotice` no erro de carga do dashboard; manter retry e chamada de reload no consumidor.
- [ ] Validar um fluxo representativo desktop e estreito antes de aplicar o padrão às demais seções.

### Administração

- [ ] Mapear solicitação/revisão de acesso, operações de pedido e notificações, permissões separadas e ações irreversíveis.
- [ ] Documentar confirmação, prevenção de repetição, feedback de resultado incerto e recuperação sem alterar comportamento de API.
- [x] Pilotar `InlineNotice` nos erros gerais de carga das duas filas, mantendo alertas e instruções por pedido locais.
- [x] Substituir confirmações nativas de recusa de acesso e revogação de link por `ConfirmationDialog`, mantendo consequências e chamadas de API específicas.
- [ ] Distinguir o painel administrativo real das rotas/superfícies internas de sandbox.

### Afiliado

- [ ] Confirmar se há produto, papéis, API, regras de comissão, relatórios e tarefas de afiliado suportados.
- [ ] Caso confirmado, criar inventário **proposto** derivado dos fluxos autorizados e validar com as regras de negócio antes de implementar.
- [ ] Caso não confirmado, documentar a lacuna e a decisão pendente; não inferir comissão, métricas, saldo ou ações de pagamento.

### Cada tranche de implementação

- [x] Piloto inicial: selecionar `StatusBadge` observado no painel do proprietário e aplicar em status de reservas ativas do painel do usuário.
- [x] Implementar o piloto com React/Tailwind já instalados, sem alterar API, autorização, pagamento ou regra de reserva.
- [x] Atualizar o catálogo interno e o mapa de consumidores, mantendo o estado como implementado até a validação visual/a11y pendente.
- [x] Adicionar `ConfirmationDialog` ao inventário e espécime de overlays do catálogo; não classificá-lo como validado.
- [ ] Registrar exceções, consumidores migrados, consumidores ainda pendentes e plano de reversão para mudança incompatível.

## Wave 4 — validação por risco e consumidor

- [ ] Definir critérios antes de validar cada tranche e inspecionar o componente no consumidor, não apenas no catálogo.
- [ ] Conferir renderização, APIs/tipos, estados e largura de coleção relevantes; não otimizar sem medição representativa.
- [ ] Conferir teclado, ordem de foco, foco visível, nome/label e semântica nos controles alterados.
- [ ] Conferir reflow e conteúdo real em viewports estreitos e largos, zoom e textos extensos; registrar valores e ambiente.
- [ ] Conferir contraste nas combinações e estados aprovados; não alegar conformidade sem critério e método aplicáveis.
- [ ] Conferir `prefers-reduced-motion` para componentes com movimento e se o estado continua comunicável sem animação.
- [ ] Usar validação automatizada, lint/type/build e testes direcionados proporcionais ao risco e às convenções do projeto.
- [ ] Distinguir inspeção estática, inspeção visual, teclado verificado, automação aprovada e avaliação com usuários; registrar verificações indisponíveis.
- [ ] Revisar diff, `git diff --check` e impactos nos consumidores antes de encerrar cada tranche.

## Wave 5 — governança e manutenção

- [ ] Definir quem pode propor, aprovar regra compartilhada, implementar e validar; até existir owner formal, registrar a decisão como pendente e não tratá-la como aprovada.
- [ ] Manter registro de mudança com data/revisão, decisão, evidência, consumidores, alternativas, impacto, estado, responsável e gatilho de revisão.
- [ ] Para depreciação: localizar consumidores, indicar substituto e migração, condição de remoção e reversão segura.
- [ ] Usar feedback de quem implementa e fricções de adoção para priorizar follow-up; contagem de adoção não substitui qualidade da tarefa.
- [ ] Preservar a página `/design-system` como catálogo e orientação interna, sem afirmar que ela própria torna a implementação canônica ou validada.

## Referências aplicadas

- Skill `ux-ui-intelligence`: `references/workflows/design-system.md`, `references/workflows/audit-component.md`, `references/foundations/visual-systems-and-engineering.md`, além de `review-interface.md` e `validate-and-report.md` conforme cada wave.
- Squad Design Markman importado pela skill: consultar `source.zip` em `references/design-markman/` para as rotas correspondentes de audit-only, extração/mapeamento de tokens, build/compose de componente, acessibilidade, migração, handoff e DesignOps. Os checklists são prompts adaptados ao stack/produto, não gate automático.
- **Adaptação ao projeto:** não importar contagens fixas, limiar de cobertura, exigência de Storybook/shadcn/Figma, CI ou agente runtime do upstream. A validação será por consumidor, risco e critério aplicável; alegações WCAG exigem critério/fonte/método compatíveis.
- Regras locais: `AGENTS.md`, skill `.agents/skills/implementar/SKILL.md`, `docs/frontend-quality-plan.md`, `docs/design-system-checklist.md`, `docs/design-system-layout-audit.md` e `docs/design-system-motion-audit.md`.

## Critério para declarar este objetivo concluído

- [ ] Painéis e limites de negócio foram mapeados com evidência, incluindo a decisão sobre a área de afiliado.
- [ ] Tokens aprovados têm valor/fonte, papel semântico, consumidores e restrições documentados; itens incertos permanecem propostas explícitas.
- [ ] Componentes selecionados têm contratos e estados implementados nos consumidores escolhidos, com exceções e pendências declaradas.
- [ ] A página `/design-system` reflete os artefatos reais e seus status sem confundir proposta, observação, implementação ou validação.
- [ ] Validações proporcionais cobrem os consumidores alterados e suas limitações estão registradas.
- [ ] Checklist e histórico refletem o estado vigente; nenhuma pendência crítica de função ou acessibilidade fica escondida sob rótulo de conclusão.
