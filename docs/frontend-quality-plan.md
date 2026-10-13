# Plano de melhorias de qualidade do frontend

## Objetivo

Aplicar as melhorias da auditoria do frontend por etapas pequenas e verificáveis, manter o Laravel e os contratos de API existentes intactos e deixar critérios de qualidade claros para novas features. Cada etapa deve ser revisada e validada antes de um commit local. Não fazer push, merge ou deploy sem autorização posterior.

## Baseline da auditoria

- Frontend: React 19, TypeScript, Vite 6 e Tailwind CSS 4.
- Backend Laravel coexistindo com serviços legados. Preservar `/api/*`, `server.ts` e as integrações existentes.
- Hotspots observados: `src/App.tsx` e `src/components/property/PropertyDetailModal.tsx`. O antigo `StaysNetModal.tsx` foi removido após confirmar que não tinha nenhum consumidor.
- O TypeScript partiu de `strict: false`; havia usos de `any` em serviços e componentes.
- Havia `package-lock.json` e `bun.lock`, enquanto o README instruía `npm ci`.
- O build partiu de um chunk JavaScript de aproximadamente 777 kB e uma importação dinâmica ineficaz de `src/data/staysApartments.ts`.
- Classes `animate-in`, `fade-in`, `zoom-in-95` e `slide-in-from-bottom` foram implementadas em `src/index.css` no commit `b373211`. O build confirmou as regras geradas e o suporte a movimento reduzido.
- Diversos modais não têm semântica de diálogo, associação completa de labels, nome em botões de ícone ou gerenciamento de foco consistente.

## Progresso atual

O trabalho é feito em commits locais pequenos, revisados e validados. A branch permanece sem push; a contagem abaixo é relativa ao estado de `origin/main` consultado nesta execução.

### Estado atual — 2026-10-13 (navegação e mapa dos hotspots)

HEAD de referência antes deste checkpoint: `8d4cc91`, `main` 101 commits locais à frente de `origin/main`; worktree sem alterações rastreadas e com `.DS_Store` não rastreado preexistente, preservado. O novo teste do detalhe elevou a suíte a 120/120. A navegação móvel agora expõe `resolveMobileNavigationTarget`, testado para proprietário aprovado/pendente e para rotas de reservas/favoritos; `App.tsx` delega a decisão de rota ao componente existente. Não muda o estado de autenticação, as rotas ou o gate: a rota `host` é renderizada pelo mesmo callback apenas quando `ownerAccessStatus === 'approved'`.

Este checkpoint dá por concluída a decomposição de `PropertyDetailModal` como fronteira de controlador: apresentação de cabeçalho, fotos/ações, seções, painel de reserva, diálogos, hook de disponibilidade/preço e regra pura de seleção estão separados; o modal coordena estado compartilhado de datas/hóspedes/galeria e impõe a guarda `stays-live` + intervalo disponível antes de chamar o callback. O teste de integração confirma o payload de reserva e que estado indisponível não chama callback. Não se extraiu a política de limite de bebês, pois não foi encontrada fonte de domínio que sustente mudar ou generalizar esse limite. `App.tsx` permanece 858 linhas e passa a ser o hotspot ativo.

Mapa para a decomposição de `App.tsx` sem mover responsabilidades em lote: (1) persistência e carregamento de catálogo Stays/cache local (`properties`, `catalogLoading`, `catalogLoadError`, `handlePullStaysApartments` e efeitos de hidratação); (2) sessão/conta/proprietário e carregamento de reservas (listener Supabase, `getSession`, reservas, acesso e admin); (3) navegação e URL (deep-link `/apartamento/:id`, `popstate`, sincronização de filtros, seleção/fechamento de detalhes e acesso proprietário); (4) busca/descoberta (filtros, categorias, catálogo de condomínios, busca datada/surpresa); (5) composição das views e diálogos. Dependências críticas a preservar: ordem e cancelamento de efeitos, `localStorage` e precedência do catálogo, import assíncrono do Supabase, `access_token` em chamadas autenticadas, payload Stays de datas/hóspedes, cache e URL profunda, histórico do navegador e reconfirmação/guarda antes do checkout. Primeiro corte recomendado é hook de catálogo com testes de precedência/cache/cancelamento; não combinar com auth nem URL.

Validações deste checkpoint: `npm test` 121/121, `npm run lint` (ESLint + TypeScript), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: entrada JS 358,18 kB / 107,12 kB gzip; CSS 107,04 / 15,70 kB gzip; Supabase 226,85 / 58,83 kB gzip; modal de propriedade 49,38 / 13,06 kB gzip. Diferenças contra a etapa anterior são mínimas e não demonstram ganho de performance; não há Web Vitals medidos. Nenhuma autenticação foi iniciada e nenhum checkout/reserva/pagamento foi enviado. O navegador em viewport estreito e desktop foi verificado no checkpoint anterior, não repetido nesta etapa.

### Continuação — 2026-10-13 (hook de catálogo)

O estado/efeitos do catálogo de acomodação foram isolados em `src/hooks/useAccommodationCatalog.ts`, reduzindo `App.tsx` sem mover autenticação, busca, URL ou regras de reserva. O hook cobre cache inicialmente aceito apenas quando `hospeda_properties_source` é `stays-live`, remoção de IDs demo, filtragem de imagens não HTTP(S), substituição por catálogo retornado, fallback do catálogo empacotado quando vazio, estado de erro/loading, persistência de alterações posteriores e descarte de respostas após unmount. A hidratação de cache agora passa cada item por `isProperty`; registros malformados deixam de entrar no estado tipado. Testes cobrem cada ramo principal. O fluxo preserva os dois consumidores existentes de `/api/accommodations`: `staysApi.fetchListings()` (também grava configuração/log da integração) e `crcnBackendApi.getAccommodations()` (fonte do catálogo/fallback). Eles fazem GETs duplicados na montagem; foram mantidos porque a remoção exigiria alterar/combinar efeitos colaterais do serviço legado, fora do escopo deste recorte. Próxima decisão técnica: avaliar consolidação em etapa própria, após especificar se o log/config da integração ainda é requisito.

Desde `90a89ef`, `main` estava 102 commits locais à frente de `origin/main`; o `.DS_Store` preexistente permanece fora do stage. `npm test` 125/125, `npm run lint` sem avisos (ESLint + TypeScript), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: entrada 358,37 kB / 107,13 kB gzip; CSS 107,04 / 15,70 kB; Supabase 226,85 / 58,83 kB; detalhe 49,38 / 13,05 kB. O delta de bundle é artefato pequeno, sem evidência de Web Vitals. Nenhuma checagem manual de navegador foi repetida nesta etapa; autenticação/checkout e as rotas Stays indisponíveis continuam com as limitações registradas acima.

### Continuação — 2026-10-13 (extração do rodapé)

`AppFooter` agora concentra a apresentação do rodapé; `App.tsx` passa a fornecer apenas a moeda e o callback para abrir o cadastro de imóvel. O teste cobre esses dois contratos. `App.tsx` caiu de 950 para 879 linhas. Os gates passaram: 113/113 testes, lint/TypeScript, `format:check`, build, formatação dos planos e `git diff --check`. Build: JS inicial 358,05 kB / 107,14 kB gzip; CSS 107,04 kB / 15,70 kB; modal 48,54 kB / 12,84 kB gzip. O pequeno acréscimo de JS corresponde ao componente agora carregado na entrada e não é apresentado como melhoria de bundle. Etapa registrada localmente em `940fabc`; nenhuma operação remota foi feita.

### Continuação — 2026-10-13 (acionador da Sofia)

O botão flutuante foi extraído para `SofiaAssistantTrigger`; estado de abertura e o modal permanecem em `App.tsx`. O componente mantém nome acessível e `type="button"`; teste confirma nome e callback. `App.tsx` passa a 1010 linhas (a formatação revelou também linhas longas herdadas, por isso a contagem bruta não é comparável diretamente com a anterior de 879). `npm test` passou 114/114; lint/TypeScript, `format:check`, build e `git diff --check` passaram após remover import não usado. Build: JS inicial 358,12 kB / 107,11 kB gzip; CSS 107,04 kB / 15,70 kB; modal 48,54 kB / 12,85 kB gzip. Diferenças pequenas de gzip não são interpretadas como otimização. Commit local pendente neste checkpoint.

### Continuação — 2026-10-13 (disponibilidade do detalhe)

As leituras de calendário e cotação foram movidas para `usePropertyAvailability`, sem alterar método, endpoint, payload, guarda de respostas obsoletas ou bloqueio de checkout. Mensagens vindas do carregamento ficam no hook; mensagens de seleção inválida continuam no modal. Teste do hook confirma ID Stays, janela de calendário de 90 dias, datas/hóspedes da cotação e estado explícito sem dados ao vivo. `PropertyDetailModal.tsx` caiu de 429 para 392 linhas sem reformatar o arquivo inteiro. Gates passaram: 116/116 testes, lint/TypeScript, format check, build e `git diff --check`. A disponibilidade agora é uma região nomeada com `aria-busy`; carregamento e erros são anunciados sem duplicar a mensagem de atualização. Testes cobrem região/estado ocupado, ID Stays, janela de 90 dias, datas/hóspedes da cotação e falha sem dados ao vivo. Build após hook + anúncio: JS inicial 358,12 kB / 107,11 kB gzip; CSS 107,04 / 15,70; modal 49,22 / 13,00 kB gzip. O chunk cresceu 0,45 kB gzip desde o checkpoint antes da extração; meta é manutenção/acessibilidade, sem alegar ganho de desempenho. Não houve smoke test autenticado nem compra/reserva.

### Continuação — 2026-10-13 (seleção de datas)

A decisão de seleção do calendário foi extraída para `src/utils/propertyDateSelection.ts`. O utilitário mantém os critérios já usados por `isCalendarRangeAvailable`: novo check-in após intervalo completo, aceitação de check-out apenas para intervalo válido e preservação das datas quando o intervalo é rejeitado, com a mesma mensagem ao usuário. Três testes cobrem esses caminhos. `PropertyDetailModal.tsx` caiu de 392 para 379 linhas. Gates passaram: 119/119 testes, lint/TypeScript, `format:check`, build e `git diff --check`. Build: JS inicial 358,12 kB / 107,11 kB gzip; CSS 107,04 / 15,70; modal 49,38 / 13,05 kB gzip. O incremento do chunk (0,05 kB gzip) não é tratado como ganho de desempenho. A seleção por calendário e datas ainda preserva o fluxo no modal; checkout não foi executado.

### Revisão residual da goal — 2026-10-13

O bloco abaixo registra o checkpoint anterior desta revisão; os números atuais desta continuação estão no checkpoint seguinte. A goal ativa continua sendo o registro de execução; não criar outra goal enquanto esta estiver ativa.

### Continuação — 2026-10-13 (limites de dados externos)

Foram endurecidos guards sem alterar contratos: `isProperty` exige ID/título não vazios, rating entre 0 e 5 e latitude/longitude dentro dos limites geográficos; `isReservation` exige noites iguais à diferença das datas ISO e valores financeiros não negativos. `createCheckout` compara noites da cotação com as datas solicitadas e valida listing. O contrato real do Laravel foi conferido: `quote.listingId` é ID interno do catálogo e `quote.staysListingId` é o ID externo enviado pelo cliente; a validação prioriza `staysListingId` quando existe para não rejeitar cotações legítimas. Não foi adicionada reconstrução de total/taxas, cuja regra não é estável o suficiente no contrato atual.

Testes cobrem entradas inválidas em propriedades/reservas, mismatch de listing/noites e aceitação do mapeamento interno/externo correto. Suíte completa: 112/112; lint/TypeScript, `format:check`, build, docs e `git diff --check` passaram. Build após os guards: JS inicial 357,95 kB / 107,16 kB gzip; CSS 107,04 kB / 15,70 kB; chunk modal 48,54 kB / 12,85 kB gzip. O aumento de 0,57 kB / 0,17 kB gzip no bundle inicial em relação ao checkpoint anterior corresponde à validação adicionada; nenhum Web Vital foi inferido.

### Continuação — 2026-10-13 (ações do detalhe)

`PropertyDetailActions` extraiu a apresentação dos controles compartilhar/salvar e mantém fechamento/foco no controlador. O botão de salvar agora expõe `aria-pressed`; teste cobre o callback com o ID do imóvel. Estado pós-commit: `main`, 92 commits à frente de `origin/main`; modal com 429 linhas e `App.tsx` ainda com 950. A suíte passou 109/109 e lint, format check, build e `git diff --check` passaram. Build observado: JS inicial 357,38 kB / 106,99 kB gzip; CSS 107,04 kB / 15,70 kB gzip; chunk do modal 48,54 kB / 12,85 kB gzip.

A auditoria de dados paralela apontou próximos casos para fortalecer: consistência de noites e datas em reservas, associação da cotação de checkout ao listing solicitado, e limites semânticos de título/localização/nota em propriedades. Ainda não alterados neste checkpoint; tratar com testes e sem inventar regra de cálculo financeiro.

### Continuação — 2026-10-13 (grid de fotos e revisão de dados)

Estado confirmado após a extração do grid: `main`, 91 commits locais à frente de `origin/main`, HEAD `b84a4dc`, árvore limpa. A extração do grid de fotos deixou `PropertyDetailModal.tsx` com 445 linhas e criou `PropertyPhotoGrid.tsx` (60 linhas). `PropertyBookingPanel` (184 linhas), `PropertyDetailHeader` (71 linhas), estado de galeria e diálogo continuam separados. O teste valida abertura na foto 2 e retorno de foco após Escape. Gates passaram: lint/TypeScript, 108/108 testes, format check, build, formatação dos dois planos e `git diff --check`. Build: JS inicial 357,38 kB / 107,00 kB gzip; CSS 107,04 kB / 15,70 kB; Supabase 226,85 kB / 58,83 kB; modal 48,54 kB / 12,85 kB gzip. São tamanhos de artefato, sem inferência de Web Vitals.

Auditoria de dados externos em `crcnBackendApi.ts` e `apiValidation.ts`: payloads são lidos como `unknown` e validados antes de entrar nos tipos do domínio para catálogo, detalhe, busca, calendário, preço, checkout/URL Stays, reservas, acesso de proprietário, solicitações, dashboard, status e Sofia. Os testes de `reservationApiValidation.test.ts` rejeitam respostas inválidas em preço, calendário, resorts, reservas e demais limites cobertos. Ponto residual de tolerância: `getResorts()` filtra registros inválidos e pode retornar os válidos de uma resposta mista, ocultando resorts malformados; o impacto é lista parcial de opções de filtro, não aceitação de dados inválidos. Não há contrato disponível que determine se a resposta deve ser atômica; manter como monitoramento até evidência de payload misto real ou regra de API.

A verificação visual desktop/375×812 e o erro de disponibilidade permanecem documentados no checkpoint anterior. OAuth/sessão/checkout autenticado, leitor de tela e emulação visual de reduced motion seguem pendentes. Nenhuma compra/reserva foi concluída e nenhum pagamento foi enviado.

### Continuação — 2026-10-13

Estado confirmado antes desta etapa: `main` limpa, 87 commits locais à frente de `origin/main`, HEAD `2cabab8`. Depois das extrações do painel e cabeçalho, `PropertyDetailModal.tsx` tinha 487 linhas; `PropertyDetailHeader.tsx` 71, `PropertyBookingPanel.tsx` 184 e `App.tsx` permanece em 950. A suíte passou 108/108; lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 357,38 kB / 106,99 kB gzip; CSS 105,83 kB / 15,63 kB; Supabase 226,85 kB / 58,83 kB; `PropertyDetailModal` 48,05 kB / 12,75 kB gzip. O chunk do modal aumentou 0,12 kB porque agora inclui a unidade carregada; o corte melhora separação de responsabilidade e não é apresentado como otimização de bundle.

O novo `PropertyDetailHeader` mantém título, avaliação e localização, delegando apenas a apresentação e o callback para rolar até as avaliações. O grid de fotos também foi extraído para `PropertyPhotoGrid`, sem estado interno; o teste da galeria agora verifica abertura direta na foto 2 e restauração do foco ao acionador após Escape. Um teste confirma o título como H1 e o acionamento da rolagem. Nenhuma regra de reserva, preço, autenticação ou contrato foi movida. A extração está validada, mas ainda é necessário terminar o hotspot antes de iniciar `App.tsx`.

Revisão visual em navegador desktop e 375×812: a página não tem overflow horizontal e o detalhe reorganiza galeria e painel em coluna. Com Laravel indisponível, calendário/preço exibem erro e CTA fica bloqueada. O botão desabilitado usava texto branco sobre gradiente com opacidade reduzida; foi ajustado para superfície neutra, texto escuro e sem sombra, preservando `disabled` e a mensagem “Valores indisponíveis” como explicação. O teste cobre estado disabled e estilos neutros. Ainda não há confirmação com leitor de tela, emulação visual de reduced motion ou auditoria sistemática de contraste sobre superfícies de vidro.

Estado confirmado antes desta etapa: branch `main` limpa, 86 commits locais à frente de `origin/main`, HEAD `ec4874c`. `PropertyDetailModal.tsx` tinha 614 linhas e `App.tsx` 950. Após extrair o painel de reserva, o modal tem 529 linhas e `PropertyBookingPanel.tsx` 184; `App.tsx` segue com 950. O build após a extração produz JS inicial 357,38 kB / 107,00 kB gzip; CSS 107,04 kB / 15,70 kB gzip; chunk Supabase 226,85 kB / 58,83 kB gzip; chunk `PropertyDetailModal` 47,93 kB / 12,69 kB gzip. São tamanhos de build, não Web Vitals.

A correção foi commitada localmente em `1c6a61b` (`fix(a11y): restore focus after deep-linked detail dialog`); a branch ficou 85 commits à frente de `origin/main`, sem push. Em nova sessão Chromium na aplicação atual, a rota direta abriu o modal e Escape fechou-o, restaurou `/` e deixou o foco no contêiner principal.

Esta rodada confirmou manualmente em Chromium desktop o detalhe acessado por deep-link `/apartamento/JQ08G`, foco inicial nomeado, fechamento de diálogo aninhado por Escape e estado fechado para reserva quando calendário/preço falham com Laravel indisponível. O fluxo catálogo → detalhe já retornava foco ao acionador. A auditoria encontrou e corrigiu o caso deep-link: ao fechar o detalhe sem acionador prévio, o foco agora retorna ao elemento `<main>`; o teste dedicado cobre esse fallback. Uma execução concorrente causou falha transitória em teste de UI de administração; o teste isolado e a suíte completa serial passaram depois (107/107). Lint/TypeScript sem avisos, `format:check`, build e `git diff --check` também passaram.

Na continuação anterior, a apresentação do cartão de reserva foi movida para `PropertyBookingPanel`, deixando estado, requote, calendário e montagem do payload no modal. O teste do modal confirma que a ação de reserva segue desabilitada sem preço/disponibilidade ao vivo. `npm test` passou 107/107; lint/TypeScript, `format:check`, build e `git diff --check` passaram. A extração não altera contratos ou endpoints.

Nesta etapa foi extraído `PropertyDetailHeader`; `npm test` passou 108/108 e os demais gates também passaram. O teste cobre H1 nomeado e callback de navegação à seção de avaliações. Ainda faltam testes manuais de leitor de tela/viewport estreito e a revisão final do restante do modal.

O inventário estático de movimento não encontrou animações que escapem do `prefers-reduced-motion` global. Ainda faltam comparação visual com reduced motion, leitor de tela, smoke OAuth/sessão/checkout autenticado e revisão visual completa de contraste. O backend Laravel não estava ativo (`ECONNREFUSED 127.0.0.1:8000`); calendário e cotação mostram erro explícito e CTA desabilitada. Em 2026-10-13, navegador Chromium voltou a validar foco inicial no detalhe, galeria fecha com Escape e devolve foco à miniatura, calendário abre com foco no botão fechar, tem nome/modal e fecha com Escape devolvendo foco ao acionador; não houve overflow horizontal em 375×812 nem em 1440×900. O detalhe empilha corretamente no viewport estreito e mantém CTA desabilitada quando Laravel está desligado. Filtros completos, leitor de tela e emulação visual reduced-motion seguem pendentes.

| Área                       | Falta fazer                                                                                                                             | Evidência / condição de encerramento                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decomposição               | Fechar a avaliação do controlador de detalhe; depois decompor `App.tsx` sem mover regras compartilhadas sem cobertura.                  | `PropertyDetailModal` tem 379 linhas; cabeçalho, fotos, ações, disponibilidade/cotação, calendário, hóspedes, localização, anfitrião, avaliações, comodidades, políticas e visão geral são componentes/hooks/utilitários separados. `selectAvailabilityDay` tem testes de intervalo. `App.tsx` está em 858 linhas; estado de auth, cache, deep-link e sessões permanecem no controle principal. Revisar o estado atual no próximo checkpoint antes de declarar a decomposição do modal concluída. |
| Acessibilidade manual      | Completar busca/filtros, leitor de tela e movimento reduzido visualmente; smoke OAuth/checkout exige sessão autenticada.                | Chromium 2026-10-13: foco inicial no detalhe, galeria com Escape/retorno à miniatura, calendário nomeado/modal com foco inicial, Escape/retorno ao acionador. Sem overflow horizontal a 375×812 (scrollWidth 375) e 1440×900 (scrollWidth 1440); CTA ficou desabilitada com Laravel indisponível. Testes cobrem calendário de datas, foco/teclado e erro; leitor de tela, jornada completa de filtros e emulação visual reduced-motion ainda pendentes. Nenhuma reserva ou pagamento iniciou.     |
| Autenticação e checkout    | Verificar callback OAuth, restauração de sessão e navegação até antes de criar reserva/pagar.                                           | Exige ambiente autenticado disponível; não usar cartão, criar reserva ou iniciar pagamento. Se indisponível, reportar dependência e impacto.                                                                                                                                                                                                                                                                                                                                                      |
| Stays ao vivo              | Confirmar endpoint/acesso de calendário e cálculo de preço.                                                                             | Em 2026-10-13, ambos os caminhos documentados retornaram 404 diretamente à Stays, embora resorts e detalhe funcionem. Não declarar disponibilidade ou preço ao vivo até confirmar a rota/acesso.                                                                                                                                                                                                                                                                                                  |
| Visual e movimento         | Rever tokens e animações nas jornadas restantes, contraste e reduced motion emulado.                                                    | Desktop e 375×812 sem overflow horizontal; CTA disabled ganhou cores neutras e indicação textual de indisponibilidade. `src/index.css` cobre reduced motion em código/testes, mas emulação visual não foi validada. Contraste de superfícies de vidro e leitor de tela seguem pendentes. Sem alegações de Web Vitals.                                                                                                                                                                             |
| Convenções e dados         | Auditar as respostas restantes e executar smoke test autenticado quando houver sessão de staging.                                       | Foram adicionadas validações e testes para sync/checkout/quote update/URL/cancelamento/acesso admin/status Stays/Sofia/solicitações/owners; preços, calendário, datas e resorts rejeitam valores inválidos. Checkout `quote_changed` não tem breakdown no contrato Laravel; UI mostra apenas total/noites e bloqueia continuar até atualizar quote completa. `propertyCount` ausente aparece como indisponível.                                                                                   |
| Organização de componentes | Migrar o domínio de acomodação para `src/components/property/` em passos por domínio, preservando componentes compartilhados fora dele. | A primeira migração moveu cartões, catálogo, detalhe e subcomponentes do imóvel; imports, testes e lista incremental do Prettier foram atualizados. Rever os demais domínios somente em etapas com benefício claro.                                                                                                                                                                                                                                                                               |

Essa revisão não encontrou motivo para alterar dependências ou contratos. Os itens dependentes de acesso externo devem terminar com evidência da tentativa e decisão necessária, não com uma alegação de conclusão técnica.

| Fase                              | Estado                                                        | Evidência / pendência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — padrão de diálogo             | Implementada; validação manual parcial                        | Testes automatizados cobrem foco inicial, contenção de Tab, Escape, retorno do foco e controles em portais fora do DOM do diálogo. Em Chromium local, detalhes e diálogos aninhados de hóspedes, datas e galeria abriram com nome/foco esperados; Escape fechou a camada superior e restaurou foco ao acionador. Outros fluxos seguem pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1 — acessibilidade                | Em andamento; fixes priorizados com testes                    | Busca, filtros, checkout, cadastro, conta, suporte, condomínio, detalhe e cartões receberam melhorias anteriores. Nesta continuação: `FilterModal` ressincroniza o rascunho após reset externo (teste de regressão); diálogos de voucher/cancelamento em `TripsView` agora têm nome, semântica modal, foco inicial/retorno e Escape; Sofia tem campo e envio nomeados, log `aria-live` e rolagem que respeita movimento reduzido; menu Minha Conta expõe seu estado, controle associado e fecha por Escape com retorno de foco; navegação do painel de proprietário informa seção atual e anuncia carregamento; calendários e seletores portaled do widget Stays ficam no ciclo de foco do diálogo; navegação mobile tem landmark nomeado, `aria-current="page"` e teste de acesso condicional ao painel do proprietário; filtros e alternância mapa/lista em `CategoryBar` mantêm nomes acessíveis em viewport estreito, e a paginação informa a posição atual; dias dos calendários Stays e de reserva no detalhe anunciam data completa; os acionadores do calendário do detalhe expõem corretamente o campo aberto, e a seleção Check-in/Check-out anuncia seu estado. Testes automatizados cobrem seleções e retorno de foco; revisar jornadas restantes, navegador e leitor de tela. |
| 2 — tipos e dependências          | Concluída para o escopo auditado                              | TypeScript estrito agora checa frontend, `server.ts` e testes via `tsconfig.json`; declaração local mínima tipa o uso existente de jsdom. npm é o único gerenciador; payloads externos seguem validados, incluindo agora o formato, datas, status e números da resposta do dashboard Laravel de proprietário.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3 — bundle e carregamento         | Em andamento; chunk inicial medido e jornada de auth pendente | Build após adicionar validação de payloads (2026-10-13): JS inicial 357,95 kB / 107,16 kB gzip; CSS 107,04 kB / 15,70 kB gzip; chunk Supabase 226,85 kB / 58,83 kB gzip; `PropertyDetailModal` 48,54 kB / 12,85 kB gzip. OAuth/sessão/checkout seguem pendentes de ambiente autenticado; tamanhos não comprovam melhora de Web Vitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4 — tokens e movimento            | Parcialmente concluída                                        | Tokens de foco, página e borda de vidro; suporte global a movimento reduzido. Rolagens acionadas pela aplicação usam comportamento automático quando `prefers-reduced-motion` está ativo, incluindo Sofia, busca e avaliações. A preferência agora desativa por completo animações decorativas (incluindo ping, pulse e spin), minimiza transições e força rolagem automática; teste de regressão valida essas regras. Revisão visual de consistência e inventário das transições próprias nas telas principais continuam pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5 — decomposição dos hotspots     | Modal quase concluído; `App.tsx` ainda por decompor           | `PropertyDetailModal` tem 379 linhas; apresentações por seção e painéis/diálogos estão delegados. API de disponibilidade/cotação está em hook; regra de seleção de datas é utilitário puro testado. Ainda avaliar fluxo de interação agregado e declarar limites restantes antes de entrar em `App.tsx` (858 linhas). Auth, deep-link, cache e integração continuam no `App.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6 — lint, formatação, testes e CI | Base implementada; cobertura incremental                      | Último checkpoint: 119/119 testes, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 358,12 kB / 107,11 kB gzip; CSS 107,04 kB / 15,70 kB gzip; modal lazy 49,38 kB / 13,05 kB gzip; Supabase 226,85 kB / 58,83 kB gzip. Números são tamanhos de artefatos, não Web Vitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7 — convenções permanentes        | Parcialmente concluída                                        | `AGENTS.md` direciona para este plano e descreve critérios de acessibilidade, tipos, tokens, movimento, API, imagens e testes; README documenta comandos e CI. Falta auditoria final de consistência dos dois guias com este plano e o plano operacional, além de conferir como o checklist será aplicado na próxima feature real.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Baseline do estado atual (2026-10-13)

Checkpoint 2026-10-13: `npm run lint`, `npm test` (105/105), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: JS inicial 357,30 kB / 106,96 kB gzip; CSS 105,55 kB / 15,57 kB gzip; Supabase 226,85 kB / 58,83 kB gzip; chunk `PropertyDetailModal` 47,23 kB / 12,53 kB gzip. São tamanhos de build, não Web Vitals. OAuth/sessão/checkout seguem dependendo de navegador com ambiente autenticado; não realizar reserva nem pagamento.

### Evidência de bundle (2026-10-12)

Build reproduzido com sourcemaps em `/tmp/hospeda-reservas-bundle-report` (artefato temporário, fora do repositório): chunk inicial 570,26 kB minificado / 162,20 kB gzip. O mapa aponta React DOM (runtime), Supabase Auth e Supabase Storage/PostgREST entre as maiores contribuições. `App.tsx` consulta a sessão no início e checkout/conta também usam auth; um `import()` chamado no início só deslocaria código para outro arquivo, sem reduzir bytes transferidos. Não introduzir divisão manual do Supabase sem redesenhar e testar a jornada de inicialização de auth. `PropertyDetailModal.tsx` é 45,18 kB minificado no build atual e já é chunk carregado sob demanda; sua decomposição é prioritariamente manutenção, não redução do chunk inicial. As extrações de preço, avaliações, comodidades e políticas mantêm o chunk inicial em 570,21 kB / 162,16 kB gzip.

### Medição após isolar o SDK Supabase (2026-10-12)

Na build de produção, o chunk de entrada passou de 575,18 kB / 163,69 kB gzip para 348,34 kB / 104,42 kB gzip (redução de 226,84 kB / 59,27 kB gzip, aproximadamente 39% / 36%). `dist/index.html` referencia apenas o chunk principal; o JS principal contém uma importação dinâmica `supabase-*.js`, cujo arquivo mede 226,85 kB / 58,83 kB gzip. `App` agenda essa importação após a primeira renderização para associar listeners e restaurar sessão; os fluxos de login e checkout também continuam podendo carregar o módulo sob demanda. Isso comprova a redução do chunk síncrono e da análise inicial de JS; o total de bytes permanece praticamente igual quando a autenticação é restaurada e o chunk separado baixa logo em seguida. Não há medição real de LCP/INP/CLS. O navegador embutido estava sem servidor local (`ERR_CONNECTION_REFUSED`), então OAuth, sessão persistida e checkout precisam de smoke test visual posterior.

### Revisão manual no navegador (2026-10-12)

Em `http://localhost:3173/`, Chromium carregou o catálogo local sem erros de console. O modal de detalhes anunciou o título e moveu foco ao botão fechar. Hóspedes, calendário e galeria abriram como segundo diálogo acessível; Escape fechou a camada superior e restaurou foco ao acionador. Galeria respondeu às setas. Avaliações e comodidades renderizaram seus títulos/grupos; regras/políticas anunciaram heading de seção e subtítulos nível 4. Em viewport CSS de 375 px, `documentElement.scrollWidth` também foi 375 px e o detalhe não teve overflow horizontal. A API local não confirmou disponibilidade e o diálogo exibiu o estado existente “Não foi possível confirmar a disponibilidade”; checkout não foi acionado. Esta verificação cobre a jornada do modal em navegador, não substitui leitor de tela nem validação dos outros fluxos.

Na sequência, com os componentes de localização/anfitrião extraídos, inspeção no Chromium desktop confirmou uma role `dialog`, os títulos “Onde você estará” e “Hospedado por Central de Reservas Caldas Novas”, um iframe de mapa e o link “Abrir no Google Maps”. O backend Laravel recebeu credenciais Stays carregadas apenas no processo a partir do `.env` privado do workspace. `GET /api/stays/status` confirmou conexão; `GET /api/accommodations/JQ08G` respondeu, mas as consultas de calendário e preço para o listing selecionado retornaram `calendar_unavailable`/`quote_unavailable` (503), e chamadas diretas aos paths correspondentes no serviço Stays responderam 404. A navegação detalhada não foi reaberta após esse diagnóstico; a API deve ser investigada separadamente antes de afirmar disponibilidade/cotação ao vivo. A sessão atual não expôs controle de viewport, portanto nenhuma nova verificação móvel foi feita para esta extração.

### Revisão manual atual (2026-10-13)

Vite foi iniciado localmente em `http://localhost:3000/apartamento/JQ08G` porque a URL anterior na porta 3173 recusava conexão. No viewport fornecido pelo navegador (571 × 910 CSS px), a busca, os cartões e o modal de detalhes carregaram com conteúdo de cache; `documentElement.scrollWidth` foi 571 px, igual à largura do cliente, sem overflow horizontal. O diálogo de detalhes anunciou o nome da acomodação; ao abrir e fechar com `Escape`, saiu da árvore de diálogos e devolveu o foco ao botão “Ver detalhes de Lacqua DiRoma IV”. A galeria abriu e fechou pelo botão nomeado. Na primeira abertura, o proxy Vite registrou `ECONNREFUSED 127.0.0.1:8000`, pois o backend não estava ativo; os fallbacks permitiram revisar a interface sem overflow.

Depois, Laravel foi iniciado na porta 8000 com as variáveis Stays carregadas somente no processo. `GET /api/health` respondeu 200; `GET /api/stays/status` confirmou conexão. Os GET documentados de condomínios e detalhe funcionaram: `GET /api/resorts` retornou 26 itens de `stays-live` e `GET /api/accommodations/JQ08G` retornou o imóvel sincronizado. A verificação de calendário para `2026-10-13` a `2026-10-15` falhou: o GET Stays documentado `/calendar/listing/JQ08G` retornou 404, traduzido pelo backend em `calendar_unavailable` (503). A consulta de preço para o mesmo período e um hóspede também falhou: o POST de leitura documentado `/booking/calculate-price` retornou 404, traduzido em `quote_unavailable` (503). A suíte de integração não prova disponibilidade nem cotação ao vivo enquanto esses endpoints permanecerem 404. A resposta estimada local observada sem credenciais não é preço autoritativo.

Leitor de tela, OAuth com sessão autenticada e checkout sem concluir reserva continuam sem validação; não foram inseridos dados de login nem iniciada transação. A inspeção desktop documentada em 2026-10-12 permanece como evidência histórica, sem repetição nesta sessão.

### Commits locais relevantes

- `b373211` restaura animações de entrada e movimento reduzido.
- `69e6ffd` cria este plano para pacotes delegáveis.
- `e9a1439` padroniza npm e remove o lockfile excedente.
- `aea3b0b` incorpora o checklist de qualidade ao guia de agentes.
- `47faf2a` habilita checagem estrita de TypeScript.
- `f0feb42` adiciona tokens de foco/página e movimento reduzido global.
- `7fc033b`, `a81bc1f`, `32e064d`, `9f99250`, `5d7d4af` e `84d2cdc` implementam melhorias de foco e semântica nos diálogos.
- `388b104` divide catálogo e telas secundárias do bundle inicial.
- `03f5ba6` e `e5b6d2a` removem casts inseguros e validam dados Stays/API.
- `068ee63` centraliza a borda dos componentes de vidro.
- `ebeff73` prioriza a primeira imagem do catálogo.
- `8a6e151` adiciona lint, formatação, teste de diálogos e CI.
- `eded865` completa teclado de busca, popovers e cartões de acomodação; lint sem avisos.

### Próximos pacotes

1. Continuar a decomposição incremental de `PropertyDetailModal.tsx`, priorizando seções apresentacionais de menor acoplamento antes de mover estado ou diálogos; acrescentar testes para invariantes de reserva antes de extrair o widget de reserva.
2. Avaliar com evidência de execução se há uma arquitetura de sessão Supabase que possa ser carregada sob demanda sem bloquear callback OAuth, restauração de sessão ou checkout; se não houver, documentar o limite de transferência em vez de dividir artificialmente.
3. Fazer revisão visual e funcional das jornadas em desktop e viewport estreito quando o browser local estiver disponível; registrar limitações se o ambiente não permitir.

## Regras para execução e subagentes

1. Antes de atuar, ler `AGENTS.md`, `README.md` e as skills aplicáveis. Para Tailwind, ler `.agents/skills/tailwindcss-development/SKILL.md`; para React/TypeScript, seguir as convenções existentes e a skill `implementar`.
2. Cada agente deve receber um único pacote de trabalho abaixo e respeitar os arquivos de responsabilidade atribuídos. Não editar arquivos pertencentes a outra frente.
3. Frentes que alteram componentes de modal devem começar depois da definição do padrão comum de diálogo, ou usar as mesmas decisões documentadas neste plano. Integrar e revisar sequencialmente para evitar APIs de foco divergentes.
4. Não adicionar dependências sem justificar necessidade, versão, manutenção e impacto no bundle. Atualizações de dependências precisam ser isoladas em commit próprio.
5. Não alterar API, backend Laravel, autenticação, checkout, contratos de dados ou comportamento de reserva como efeito colateral de refatoração visual.
6. Não criar mocks que escondam falhas de API. Estados de erro, carregamento, cancelamento e autenticação devem continuar explícitos.
7. Cada pacote termina com diff revisado, validações executadas e resumo de arquivos/risco. Criar commits locais pequenos, com mensagem convencional, conforme autorização do usuário. Push continua fora do escopo.

## Ordem de execução

### Fase 0 — base e padrão acessível de diálogo

**Responsabilidade:** agente coordenador; limitar alterações a novos utilitários acessíveis compartilhados e documentação técnica estritamente necessária.

**Trabalho:**

- Definir e implementar o padrão comum para diálogos React: `role="dialog"`, `aria-modal`, nome acessível, foco inicial, contenção de Tab, fechamento por Escape quando aplicável e restauração do foco ao fechar.
- Preferir APIs nativas e código pequeno. Se for necessária dependência de focus trap, apresentar evidência de incompatibilidade das APIs nativas antes de adicioná-la.
- Definir comportamento para diálogos aninhados, popovers e conteúdo rolável; garantir que Escape feche somente a camada superior.
- Registrar como o padrão é consumido pelos componentes antes de delegar as fases seguintes.

**Aceite:** padrão cobre teclado e leitor de tela sem depender de clique; foco não escapa para o fundo; foco retorna ao acionador; Escape não fecha camadas erradas; build passa.

### Fase 1 — acessibilidade dos fluxos de busca e reserva

**Pacote A — busca e filtros**

- Responsável por `src/components/SearchModal.tsx` e `src/components/FilterModal.tsx`.
- Aplicar o padrão comum, associar todos os labels aos campos, nomear botões somente com ícone e garantir foco visível.
- Preservar filtros aplicados, reset, abas, datas, hóspedes e integração com `StaysSearchWidget`.

**Pacote B — checkout e cadastro de anúncio**

- Responsável por `src/components/CheckoutModal.tsx` e `src/components/CreateListingModal.tsx`.
- Aplicar semântica e foco do diálogo, associar labels, nomear os botões de voltar/fechar e expor erros/estados de processamento de forma acessível.
- Preservar autenticação Supabase, sincronização Stays e o fluxo de checkout hospedado; não coletar dados de cartão.

**Pacote C — Stays e detalhes de acomodação**

- Responsável por `src/components/property/PropertyDetailModal.tsx`.
- Aplicar padrão aos diálogos e subdiálogos existentes, incluindo galeria, datas, hóspedes e mensagens de status; corrigir rótulos e botões de ícone.
- Preservar contratos da Stays API, navegação de calendário, cotação e comportamento de disponibilidade.

**Pacote D — demais modais e navegação**

- Responsável por `src/components/CondominiumDetailModal.tsx`, `src/components/GuestAccountModal.tsx`, `src/components/SofiaAssistantModal.tsx`, `src/components/TripsView.tsx`, `src/components/Header.tsx` e `src/components/CategoryBar.tsx`.
- Aplicar o padrão comum a todos os diálogos restantes e corrigir controles sem nome/foco visível encontrados durante a inspeção.

**Aceite comum:** abertura e fechamento por teclado; foco inicial lógico; Tab/Shift+Tab contidos no diálogo; Escape fecha a camada esperada; foco restaurado; labels anunciados corretamente; erros e sucesso anunciados sem duplicação; fluxos existentes preservados.

### Fase 2 — dependências e qualidade de tipos

**Responsabilidade:** um agente; `package.json`, lockfiles, `README.md`, `tsconfig*.json`, `src/types/`, `src/services/` e arquivos de frontend que usam `any`.

**Trabalho:**

- Confirmar a orientação de instalação e o ambiente de CI; padronizar npm ou Bun e manter um lockfile como fonte oficial.
- Não atualizar versões incidentalmente durante a remoção do lockfile excedente.
- Substituir `any` por tipos explícitos. Usar `unknown` e validação nas fronteiras para respostas externas não confiáveis.
- Habilitar TypeScript estrito progressivamente (`strictNullChecks`, `noImplicitAny` e outras opções com correções por domínio), sem deixar o build permissivo em silêncio.

**Aceite:** instalação limpa pelo gerenciador documentado; lockfile reproduzível; `npm run build` passa; sem novos `any`; erros restantes da migração estrita ficam rastreados com escopo e próxima etapa.

### Fase 3 — bundle e carregamento

**Responsabilidade:** um agente; `src/App.tsx`, `src/data/staysApartments.ts`, imports relacionados e `vite.config.ts` somente quando necessário.

**Trabalho:**

- Usar relatório do build para identificar os maiores módulos e dependências; registrar baseline antes da mudança.
- Corrigir a mistura de import estático e dinâmico de `staysApartments.ts` de modo que a divisão seja efetiva ou remover a falsa otimização.
- Avaliar carregamento sob demanda para modais/telas pesadas, com fallback de carregamento e erro.
- Rever prioridade de carregamento das imagens: imagem principal visível não deve ser lazy por padrão; conteúdo fora do viewport pode permanecer lazy.
- Medir build e, quando ambiente disponível, LCP/CLS/INP em fluxo representativo. Não afirmar melhoria de Web Vitals sem medição comparável.

**Aceite:** build sem o aviso de divisão ineficaz; redução de bundle comprovada por relatório ou decisão documentada se uma divisão não compensar; fluxos de navegação testados; limites de Core Web Vitals reportados somente com medição real.

### Fase 4 — tokens e consistência visual

**Responsabilidade:** um agente; `src/index.css` e componentes estritamente necessários para adotar tokens.

**Trabalho:**

- Inventariar cores e valores repetidos; criar tokens semânticos compatíveis com Tailwind v4 via `@theme`/custom properties, sem mudar a identidade visual por acidente.
- Aplicar tokens gradualmente a superfícies, texto, bordas, estados de foco, sucesso, alerta e erro.
- Garantir que animações respeitem `prefers-reduced-motion` (incluindo transições próprias existentes).
- Não criar tema escuro completo sem requisitos visuais e cobertura de todas as telas; documentar o estado atual.

**Aceite:** tokens representam valores repetidos existentes; nenhuma diferença visual regressiva nas telas principais; build passa; movimento reduzido desativa ou minimiza animações não essenciais.

### Fase 5 — decomposição dos hotspots

**Responsabilidade:** um hotspot por agente/PR local sequencial; arquivos não devem ser editados simultaneamente.

**Ordem:** concluir `PropertyDetailModal.tsx`, depois decompor `App.tsx`. `StaysNetModal.tsx` foi avaliado e removido por não ter consumidores; o widget compartilhado continua em `StaysSearchWidget.tsx`.

**Trabalho:** extrair subcomponentes/hooks por responsabilidade, sem alterar APIs ou regras de negócio. Só criar primitivas compartilhadas quando dois ou mais usos concretos justificarem a abstração.

**Aceite:** componentes menores e com responsabilidades identificáveis; sem duplicar estado nem alterar contratos; comportamento e renderização preservados; build e testes relevantes passam.

### Fase 6 — lint, formatação, testes e CI

**Responsabilidade:** um agente; `package.json`, configuração de lint/format, testes frontend e workflow de CI.

**Trabalho:**

- Escolher ESLint/formatter compatíveis com React 19, TypeScript e Tailwind v4; evitar regras conflitantes ou fixers que reformatem todo o legado de uma vez.
- Criar verificações de acessibilidade para diálogos e fluxos críticos com testes significativos (labels, nomes, foco, teclado e estados de erro).
- Adicionar ao CI instalação reproduzível, lint, testes e build; evitar segredos e serviços reais nos testes.
- Cobrir os critérios do checklist na próxima feature e adicionar revisão visual/manual para aspectos que automação não consegue provar.

**Aceite:** comandos documentados e reproduzíveis localmente/CI; lint, testes e build passam; testes falham diante de regressão representativa; nenhum teste depende de segredo, PMS real ou usuário real.

### Fase 7 — convenções e checklist permanente

**Responsabilidade:** agente coordenador; `AGENTS.md` e, se apropriado, instrução curta em `.codex/` referenciada por ele.

**Trabalho:** incorporar as convenções aprovadas e o checklist de novas features sem duplicar instruções. Cobrir acessibilidade, tipos, estados de interface, serviços, tokens, movimento, imagens, testes e revisão de impacto nas jornadas.

**Aceite:** instruções são específicas do repositório, consistentes com Laravel + React/Vite, executáveis por agentes e não contradizem comandos ou skills existentes.

## Estratégia de integração e versionamento

- Cada pacote deve terminar com diff revisado e validação registrada antes de um commit local pequeno, convencional e isolado.
- Não misturar correções de acessibilidade, alterações de dependência e refatorações de comportamento no mesmo commit.
- Não fazer push, merge ou deploy sem autorização explícita.
- O commit `b373211` é uma etapa inicial concluída: animações de entrada e suporte a movimento reduzido.

## Verificações por pacote

- `git diff --check` e revisão manual do diff.
- `npm run build` para alterações de frontend e configuração.
- `npm test` para mudanças cobertas pelos testes existentes; acrescentar testes de interação quando necessários para provar critérios de acessibilidade/comportamento.
- Testar com teclado (Tab, Shift+Tab, Enter, Space, Escape), viewport estreito e leitor de tela quando disponível.
- Rever avisos do build e comparar tamanho de assets para alterações de performance.
- Backend Laravel: executar verificações Laravel apenas se uma mudança tocar backend; o plano não autoriza mudanças de API como parte de refatoração do frontend.

## Checklist de qualidade para toda nova feature

- [ ] Escopo, estado de carregamento, sucesso, vazio e erro estão definidos.
- [ ] Props, serviços e respostas têm tipos explícitos; dados externos são validados.
- [ ] Labels estão associados; controles de ícone têm nome acessível; foco é visível.
- [ ] Modais têm semântica e gestão de foco; teclado não alcança conteúdo de fundo.
- [ ] A feature funciona por teclado e em viewport estreito.
- [ ] Cores e estados seguem tokens e padrões existentes.
- [ ] Movimento respeita `prefers-reduced-motion`.
- [ ] Imagens têm alt adequado e prioridade de carregamento apropriada.
- [ ] Chamadas de API preservam contratos, autenticação e tratamento de falhas.
- [ ] Testes cobrem regras e interações que podem regredir; build/lint passam.
- [ ] Impacto em busca, detalhe, autenticação, checkout e acessos de proprietário foi avaliado.
- [ ] Diff e dependências foram revisados; nenhuma medição de performance é alegada sem evidência.
