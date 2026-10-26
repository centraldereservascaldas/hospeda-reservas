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

## Progresso e histórico de checkpoints

Os checkpoints abaixo registram o estado observado em cada data, inclusive contagens de testes, artefatos e pendências daquele momento; não descrevem necessariamente o HEAD ou o worktree atual. Para o estado vigente, conferir o Git e executar novamente as verificações correspondentes. O trabalho é feito em commits locais revisados; as contagens históricas de distância para `origin/main` não incluem fetch posterior.

### Checkpoint anterior — ações de overlay em hook (2026-10-13)

As ações restantes de overlay foram extraídas de `App.tsx` para `src/hooks/useAppOverlayActions.ts`: adicionar anúncio, transferir o payload de booking depois de fechar o detalhe, aplicar destino/hóspedes sugeridos pela Sofia e fechar a Sofia antes de selecionar um imóvel. O hook recebe setters/callbacks e usa atualização funcional do catálogo. O tipo `AppOverlayBookingPayload` foi movido para `src/types/booking.ts`, compartilhado entre App, hook e camada de overlay. `App.tsx` caiu de 294 para 280 linhas.

Quatro testes cobrem merge de filtros sem apagar datas, seleção após fechar Sofia, entrega do payload sem chamar checkout e prepend funcional no catálogo. `npm run lint`, `npm run format:check`, build e `git diff --check` passaram; suíte serial passou 178/178. Uma primeira rodada paralela reportou erro de carregamento de um arquivo; o arquivo isolado passou 14/14 e repetição serial completa passou 178/178, sem falha reproduzível. Build: JS inicial 365,39 kB / 108,86 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; detalhe 51,65 / 13,84. Entrada cresceu 0,60 kB / 0,14 kB gzip ante o checkpoint anterior; são tamanhos de artefato, sem inferência de Web Vitals. Sem alterações em contratos Laravel/Express/Stays, autenticação, reserva ou checkout; nenhum checkout, reserva ou pagamento foi iniciado.

Os commits locais desta etapa são `1f677c4` (código) e `6869c62` (documentação). Naquele checkpoint, `HEAD=6869c62` estava 151 commits acima da referência local `origin/main` (sem fetch), sem alterações rastreadas pendentes; `.DS_Store` já estava não rastreado. Header, navegação e closures simples de fechar modais ainda compõem `App.tsx`; verificar se justificam extração adicional, sem abstrações artificiais.

### Reauditoria de teclado, Stays e gates — 2026-10-13

No início desta reauditoria, o código estava no commit `3023933` e a documentação-base em `78603a9`; `main` estava 155 commits à frente da referência local `origin/main` (sem fetch). Não havia alterações rastreadas pendentes e `.DS_Store` continuava não rastreado. No Chromium local, Aquarius Flat Apto B 301 carregou o detalhe com datas 13–15/10/2026, diálogo nomeado por `property-detail-title` e `aria-modal=true`; calendário indicou “Sincronizado”, duas noites e total cotado de R$347, sem acionar “Continuar para reserva”. O foco inicial foi o botão de fechar; após 40 Tabs, continuou dentro do diálogo; Escape no deep link retornou a rota `/` e foco ao contêiner principal. Filtros também abriram com semântica de diálogo; Tab manteve foco no diálogo e Escape devolveu foco a “Abrir filtros”. O menu Minha Conta abriu o diálogo de login e anunciou “O serviço de login ainda não está configurado.” O browser desta sessão manteve 469×1015 CSS px mesmo após tentativa de override 375×812; essa observação não é evidência para 320/375. O histórico de Chromium isolado nesses breakpoints continua sendo a evidência responsiva anterior.

Reexecução no checkout: `npm test -- --test-concurrency=1` passou 181/181; `npm run lint`, `npm run format:check` e `npm run build` passaram. Build: JS inicial 365,39 kB/108,86 kB gzip; CSS 107,37/15,78; Supabase 226,85/58,83; `PropertyDetailModal` 51,65/13,84. Os valores são tamanho dos artefatos, não Web Vitals. A suíte imprime erros/fallbacks de API em casos de teste que os provocam deliberadamente; não houve falha de teste. Nenhuma API, autenticação ou fluxo de reserva mudou.

### Auditoria de detalhe em browser — 2026-10-13

No Chromium local, a rota `/apartamento/LG02J` abriu o detalhe de Aquarius Flat Apto B 301. A consulta DOM confirmou viewport 1600×900 CSS px, documento sem overflow horizontal, diálogo com `role=dialog`, `aria-modal=true` e nome associado ao título. Abrindo o detalhe pelo cartão, 40 Tabs permaneceram dentro do diálogo; Escape fechou e devolveu foco ao botão “Ver detalhes de Aquarius Flat Apto B 301”. Uma abertura deep link anterior sem cartão devolveu foco ao landmark principal. Naquela captura, calendário/cotação ainda mostravam loading e avaliações exibiam estado de indisponibilidade; a condição foi revalidada no checkpoint posterior de 13/10 descrito acima, com disponibilidade e cotação carregadas. Nenhuma ação de reserva/checkout foi acionada.

O browser automatizado compartilhado estava ocupado, então não foi possível configurar 320/375 CSS px nem emular `prefers-reduced-motion` nesta rodada. A preferência observada era `no-preference`. Leitor de tela, contraste medido e comparação visual normal/reduzida permanecem pendentes. Este check atualiza evidência de teclado em desktop, mas não substitui os viewports estreitos e walkthroughs completos anteriores.

### Revalidação da API local e mídia Stays — 2026-10-13

O Laravel local respondeu HTTP 200 em `/api/stays/status` e `/api/accommodations`; o catálogo veio com `source=stays-live`, 56 anúncios, e os 56/56 passaram `isProperty`. As 56 URLs de capa foram HTTPS, sem credenciais, todas no host `crcn.stays.net`; uma consulta somente leitura ao detalhe de um anúncio retornou HTTP 200 e 30 URLs HTTPS no mesmo host. Nenhuma URL HTTP inválida foi observada. O OpenAPI local descreve `_t_mainImageMeta.url` e `_t_imagesMeta[].url` apenas como string (“image uri”), sem contrato de domínio/CDN. Portanto, mantenho a validação atual genérica para HTTP(S), sem allowlist codificada: a amostra de capas e um detalhe não provam todos os hosts legítimos de imagens, avatares, reservas e anúncios futuros.

As chaves públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão definidas sem valor no `.env`; não registrei valores de credenciais. Assim, o backend/Stays está disponível, mas login, sessão real e checkout autenticado continuam sem configuração do cliente Supabase. Nenhum POST ou fluxo de reserva/pagamento foi iniciado.

### Smoke de disponibilidade e estado de avaliações — 2026-10-13

Repeti a consulta em Aquarius Flat Apto D 704 para 13–15/10/2026. O calendário GET via Laravel e proxy Vite retornou HTTP 200, `source=stays-live`, três dias disponíveis; a cotação calculada por POST retornou HTTP 200, duas noites, R$347. No browser, após a transição inicial de loading, o detalhe exibiu “Sincronizado”, preço de R$347 e CTA habilitado. O CTA não foi acionado. Isso confirma uma amostra de disponibilidade e preço, sem validar o catálogo inteiro nem checkout.

A resposta do detalhe informou `reviewCount=0` e `reviews=[]`. O estado vazio sincronizado agora diz “Este anúncio ainda não tem avaliações publicadas.”; o estado sem sincronização usa mensagem neutra de indisponibilidade. O ajuste está no commit de código `3023933`, coberto por três testes de estado. Não havia corpus de avaliações reais para validar sua renderização.

O gate completo após a alteração passou: 181/181 testes, lint/TypeScript, `format:check` e build. Os artefatos mantiveram o baseline: JS inicial 365,39 kB/108,86 kB gzip; CSS 107,37/15,78; Supabase 226,85/58,83; detalhe 51,65/13,84. Tamanhos são medidas do bundle, não Web Vitals. `git diff --check` passou antes do commit. A documentação será registrada em commit local separado; sem push, merge ou deploy.

### Checkpoint histórico — composição dos overlays (2026-10-13)

Os oito modais de detalhe de imóvel, condomínio, Sofia, checkout, conta, busca, filtros e criação de anúncio foram movidos para `src/components/AppOverlayLayer.tsx`. O componente pai continua dono dos estados, handlers de roteamento e guardas; a camada recebe valores/callbacks explicitamente. Os imports lazy e wrappers `DeferredModal` continuam por modal. O teste novo comprova que nenhum diálogo monta inicialmente e que abrir/fechar busca mantém o callback esperado. `App.tsx` caiu de 354 para 294 linhas; `AppOverlayLayer` tem 202 linhas. Isso remove JSX de composição do hotspot, mas ainda deixa handlers de estado/roteamento em `App.tsx`; a decomposição não está completa.

Validação desta etapa: 174/174 testes, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 364,79 kB / 108,72 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; detalhe 51,65 / 13,84. Comparado ao checkpoint anterior (363,69 / 108,30 para JS inicial), cresceu 1,10 kB e 0,42 kB gzip; não se atribui ganho de desempenho, e não são Web Vitals. O código e esta documentação foram registrados nos commits `b21c39d` e `19b8d21`; agora a branch está 148 commits locais acima da referência local não atualizada `origin/main`. `.DS_Store` continua não rastreado e fora dos commits. Sem mudanças no backend, contratos Stays, autenticação, reserva ou checkout; sem push/merge/deploy.

### QA manual de overlays e viewport — 2026-10-13

Em Chromium local, desktop 1600×900, o catálogo e o detalhe de “Aquarius Flat Apto B 301” renderizaram sem overflow horizontal; o detalhe abriu com foco em “Fechar detalhes da acomodação”. Trinta Tabs permaneceram dentro do diálogo; Escape fechou e devolveu o foco ao cartão acionador. Em um teste separado, quarenta Tabs permaneceram dentro de Filtros; Escape fechou e devolveu o foco a “Abrir filtros”. Nenhuma ação de checkout/reserva foi acionada.

Para viewport estreito, foi solicitado 375×812, mas o browser só aplicou 469 CSS px de largura (altura reportada 1015); nessa largura efetiva, a página, o detalhe e Filtros não apresentaram overflow horizontal. O diálogo de filtros coube na largura e manteve os controles e ações visíveis/roláveis. A limitação impede afirmar cobertura nos breakpoints de 320/375 px. O navegador expôs `prefers-reduced-motion: false` e não oferece nesta sessão emulação de media features; comparação visual reduzida/normal segue pendente. Não foi executado leitor de tela nem medição manual de contraste. A evidência é uma checagem manual amostral, não uma auditoria universal de teclado.

Pendências naquele checkpoint incluíam roteiro formal completo de teclado, validação real a 320/375 px, leitor de tela e contraste, comparação visual de movimento, smoke autenticado de sessão/checkout, allowlist/hosts de imagem baseada em amostra da Stays, avaliação final dos adaptadores e extração dos handlers restantes de `App.tsx`. O smoke autenticado depende de runtime e conta de QA com login configurado; o impacto é não validar sessão persistida e checkout autenticados. A allowlist e a compatibilidade externa dos métodos/GET redundantes dependem de contrato ou evidência dos consumidores. Não concluir reserva nem pagamento.

### Checkpoint histórico — extração do view model do catálogo (2026-10-13)

A lógica derivada da exploração foi extraída de `App.tsx` para `src/hooks/useExploreCatalogViewModel.ts`: imóveis filtrados, categorias disponíveis, diretório de condomínios, status do catálogo, quantidade de filtros ativos e lista de favoritos. O hook recebe apenas estado já existente; filtros, chamadas de API, autenticação e fluxos de reserva não mudaram. `App.tsx` foi de 370 para 354 linhas. O teste novo cobre filtro de destino/quartos, categorias, favoritos, agrupamento de condomínio e estados `loading`/`error` quando não há imóveis.

No commit `525c04c`, a suíte passou 172/172, além de lint/TypeScript, `format:check`, build e `git diff --check`. Build: JS inicial 363,09 kB / 108,19 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; detalhe 51,65 / 13,84. Variação de bytes do bundle é apenas tamanho de artefato; não indica Web Vitals. O baseline da etapa era `3fad054`, com 141 commits à frente da referência local `origin/main` sem fetch; após o commit de código `525c04c`, eram 142 e, com o commit documental desta etapa, são 143. `.DS_Store` continua não rastreado e fora do commit. Nenhum backend, contrato Stays, autenticação ou reserva foi alterado; sem push, merge ou deploy.

No Chromium local, o deep link `/pt/apartment/LG07J/crcn-casa-com-piscina?from=2027-03-01&to=2027-03-05&persons=10` abriu `CRCN - Casa com Piscina`, preservou rota localizada e carregou 01/03/2027, 05/03/2027 e 10 hóspedes. O sincronizador normalizou o query para `guests=10&adults=10`. Após aguardar a resposta, a tela mostrou calendário sincronizado, todas as noites do intervalo desabilitadas, “Valores indisponíveis” e CTA “Disponibilidade indisponível” desabilitada. GET local Laravel `/api/accommodations/LG07J/calendar` limitado a 01–05/03/2027 retornou `source=stays-live`, cinco dias com `avail=0` e `price=null`, consistente com esse estado; nenhum checkout/reserva/pagamento foi iniciado. Isso valida o estado indisponível, não uma falha de preço nem disponibilidade futura geral. A observação partiu de `33f0060` (143 commits à frente); este checkpoint documental adiciona um commit local, elevando a contagem a 144.

A validação visual de viewport estreito não foi repetida porque a mudança de código da etapa só moveu cálculos derivados para um hook e preservou as props. Leitor de tela, percurso integral de teclado em 320/375 CSS px, contraste manual, comparação visual de movimento e smoke autenticado continuam pendentes conforme os checkpoints anteriores.

### Validação de metadados externos opcionais — 2026-10-13

A revisão de `isProperty` encontrou propriedades opcionais ainda não verificadas que eram usadas como strings/flags: `complexName`/`complexDescription` no agrupamento de condomínios, `staysSynced`/`reviewsSynced` na interface e campos opcionais de avaliações (`authorAvatar`, `source`, `publicationStatus`). A validação agora rejeita tipos/enums inválidos antes de os dados entrarem no catálogo; teste regressivo cobre cada campo e confirma review válido. `format:check` passou a incluir `src/utils/apiValidation.ts`.

A leitura local Laravel do catálogo retornou 56 itens `stays-live`, e todos passaram o validador atualizado (`invalid=0`). O commit `f1999c1` passou 173/173 testes, lint/TypeScript, `format:check`, build e `git diff --check`. O JS inicial passou de 363,09 kB / 108,19 kB gzip para 363,69 / 108,30; CSS 107,37 / 15,78, Supabase 226,85 / 58,83 e detalhe 51,65 / 13,84. A variação é tamanho de artefato, não Web Vitals. A branch estava 145 commits à frente da referência local não atualizada; `.DS_Store` segue fora do Git. Nenhum contrato, auth ou fluxo de reserva foi alterado.

### Checkpoint histórico — revisão Stays, descrição e auditoria visual (2026-10-13)

#### Continuação da auditoria — 2026-10-13 (link de busca, calendário e autenticação)

O exemplo de URL compartilhável `/pt/apartment/{id}/{slug}?from=2027-03-01&to=2027-03-05&persons=10` está coberto por teste de roteamento: seleciona o anúncio, restaura entrada/saída e interpreta `persons` como 10 adultos sem alterar a rota localizada. Calendário e cotação `source=stays-live` foram observados em duas amostras para 13–15/10/2026: Aquarius Flat Apto B 301 no browser e Apto D 704 via GETs somente leitura ao Laravel; a segunda cotação foi R$347 para duas noites. No browser, a ação para continuar ficou habilitada, mas não foi acionada. Duas amostras não provam todo o catálogo nem a jornada de reserva.

O smoke autenticado permanece limitado: a sessão do navegador está desconectada e o modal de login respondeu “O serviço de login ainda não está configurado”. Embora existam nomes de variáveis Supabase no `.env`, a sessão do Vite que serviu `localhost:3000` não tinha URL/chave anon injetadas no módulo cliente. Não foi inserida credencial, iniciada sessão, acionado checkout ou concluída reserva/pagamento; precisa de runtime de teste corretamente configurado e conta de QA.

Em seguida, `DeferredModal` foi extraído de `App.tsx` para `src/components/DeferredModal.tsx`; teste verifica montagem apenas após primeira abertura e preservação da instância ao fechar. `App.tsx` ficou com 368 linhas. A etapa passou 169/169 testes, lint/TypeScript e build; a medição do build permaneceu em 362,55 kB / 108,23 kB gzip para JS inicial, sem redução atribuída a esta extração. O segundo anúncio teve calendário e preço `stays-live` confirmados em GETs somente leitura (13–15/10/2026, 2 noites, R$347). Estado revalidado antes do commit desta etapa: `HEAD=931d255`, branch 139 commits à frente da referência local `origin/main` (sem fetch). `.DS_Store` permanece não rastreado e fora das alterações.

Na etapa seguinte, `AuthCallbackNotice` foi extraído para `src/components/account/AuthCallbackNotice.tsx`; testes cobrem anúncio de erro (`alert`), sucesso (`status`) e acionamento do fechamento. O arquivo `App.tsx` agora tem 370 linhas, sem reformatar linhas preexistentes. Os gates passaram com 171/171 testes, lint/TypeScript, `format:check`, build e `git diff --check`. O build inicial ficou em 362,64 kB / 108,20 kB gzip (antes: 362,55 / 108,23); a diferença é medida de artefato e não é interpretada como melhoria de Web Vitals. Browser confirmou abertura e Escape/retorno de foco no detalhe. Na reabertura, observou-se transitoriamente “Atualizando disponibilidade...” com CTA desabilitado e resumo de preço ainda visível; a consulta direta seguinte ao Laravel retornou calendário e preço `stays-live` com sucesso. Isso não comprova falha persistente, e o CTA permaneceu bloqueado durante o loading. O viewport estreito não pôde ser redefinido nesta sessão Playwright ocupada. Estado antes do commit: `HEAD=4d6b715`, 140 commits à frente da referência local. Nenhuma API ou regra de autenticação/reserva foi alterada.

O backend Laravel autenticado localmente respondeu `source=stays-live` com 56 acomodações e imagens hospedadas em `crcn.stays.net`; o detalhe consultado retornou 30 fotos. A investigação encontrou que o frontend rejeitava registros live incompletos, além de um conflito entre ID local e ID interno Stays que podia combinar descrições da fixture com outro anúncio. O mapper agora produz o contrato frontend com valores neutros quando preço/dados auxiliares não são fornecidos e associa metadados da fixture somente quando o identificador de anúncio coincide. A rota `/api/accommodations/{id}` prioriza a galeria de detalhe. Teste de regressão cobre anúncios sem vínculo correto à fixture. No Chromium local, o catálogo exibiu fotos Stays e o detalhe exibiu “Mostrar todas as 30 fotos”.

A apresentação de “Sobre este espaço” normaliza separadores HTML/textuais, cria espaçamento e títulos para seções e listas de quartos, preservando o texto recebido. O parser aceita `persons` e a rota localizada `/pt/apartment/{id}/{slug}`; o exemplo `from=2027-03-01&to=2027-03-05&persons=10` abriu com datas e 10 hóspedes sem iniciar reserva. No commit `b9ed4d8`, passaram 164/164 testes frontend (serial), lint/TypeScript, `format:check`, build, 21/21 testes Laravel (92 assertions), Pint e `git diff --check`. Build: entrada JS 361,66/108,16 kB gzip; CSS 107,37/15,78; Supabase 226,85/58,83; detalhe 51,62/13,83. São tamanhos de artefato, não Web Vitals.

Na continuação visual, Chromium local em `/apartamento/LG02J` revelou um intervalo excessivo entre o resumo e “Sobre este espaço” quando não há destaques. A causa era um wrapper vazio com padding; o bloco agora só é renderizado quando há itens, com teste regressivo. Captura estreita confirmou o intervalo reduzido. No teclado, Tab alcançou os controles do detalhe, Escape fechou o deep link e focou o landmark principal; “Filtros” abriu com foco em “Fechar filtros” e Escape restaurou foco ao acionador. Essa checagem é amostral, não substitui o roteiro integral em 320/375 CSS px nem leitor de tela. O commit `d4f3c00` passou 165/165 testes, lint/TypeScript, `format:check`, build, Prettier dos planos e `git diff --check`; backend não foi alterado. Build após a correção: entrada JS 361,66/108,16 kB gzip; CSS 107,37/15,78; Supabase 226,85/58,83; detalhe 51,65/13,84.

A composição das views de conteúdo saiu de `App.tsx` para `src/components/MainContentRouter.tsx`; `App.tsx` passou de 479 para 376 linhas. A nova view recebe os dados e callbacks do estado existente, e a autenticação, filtros, seleção, catálogo e regras de reserva permaneceram no app. `LazyFeatureBoundary` foi movida sem mudar seus estados/fallbacks; as views mapa, viagens, favoritos e proprietário continuam lazy. Três testes cobrem seleção de catálogo, diretório vazio e carregamento lazy de viagens. Browser local confirmou catálogo e abertura do detalhe Stays com 30 fotos; não houve navegação de checkout. A suíte passou 168/168, lint/TypeScript, `format:check`, build e `git diff --check` passaram. O build ficou em JS inicial 362,55 kB / 108,23 kB gzip, CSS 107,37 / 15,78; chunks Supabase 226,85 / 58,83 e detalhe 51,65 / 13,84. O JS inicial cresceu 0,07 kB gzip versus o checkpoint anterior; tamanhos não são Web Vitals nem demonstram ganho. Antes de registrar esta etapa, `main` estava 136 commits à frente da referência local `origin/main` (sem fetch).

Limites que permanecem: textos secundários e dados auxiliares vêm somente da resposta Stays; anúncios sem descrição não recebem texto de fixture. Calendário/cotação podem falhar e nenhuma reserva/pagamento foi enviada. Ainda faltam roteiro de teclado completo, leitor de tela/contraste manual, login/checkout autenticados, comparação visual de movimento, allowlist abrangente de hosts e avaliação de adaptadores; `App.tsx` segue em decomposição após extrair o roteador das views principais. Nenhum push, merge ou deploy. O commit `d4f3c00` foi registrado quando `main` estava 135 commits à frente da referência local `origin/main` (não atualizada por fetch). `.DS_Store` não rastreado ficou fora do commit.

### Continuação — 2026-10-13 (teclado em diálogos)

Em navegador Chromium local, o diálogo de filtros abriu com foco no botão “Fechar filtros”. Após 50 pressões de Tab, o foco continuava em um checkbox do próprio diálogo; Escape fechou a camada e retornou ao botão “Abrir filtros”. O diálogo de busca global também abriu com foco em “Fechar busca de hospedagens”; após 40 Tabs, o foco continuava em um botão interno e Escape retornou ao acionador de busca do cabeçalho. Isso é uma amostra manual de contenção/retorno do foco nos dois diálogos, sem alterar filtros ou iniciar busca. A aba usou o viewport disponível do navegador; não houve override para 320/375 CSS px. Não foram executados leitor de tela, medição manual de contraste ou comparação visual dos estados de movimento. Nenhuma reserva ou pagamento foi realizado.

### Checkpoint anterior — 2026-10-13

Checkpoint histórico em 2026-10-13: `main` estava 131 commits à frente antes de `b9ed4d8`; após esse commit, a contagem verificada é 134 commits em relação à referência local `origin/main` (não atualizada por fetch). Correção responsiva em `841ab5b` e validação de noites calculadas em `cce3e5f`. `src/App.tsx` tem 479 linhas e `PropertyDetailModal.tsx`, 379. Ações de conta/reserva estão em `useAccountActions`; favoritos em `useSavedPropertyIds`. Imagens de catálogos, busca, detalhe, Stays, reservas e painel removem URL relativa, protocolo fora de HTTP(S) e URL com credenciais; allowlist real segue pendente da integração autenticada. Rejeição de calendário encerra loading e mostra indisponibilidade. Em Chromium isolado, viewports 320/375 CSS px não tiveram overflow horizontal; busca, filtros, conta e detalhe foram exercitados com teclado. O atalho inline da Sofia substituiu a bolha flutuante na busca mobile para remover sobreposição do CTA; em outras telas mobile, a bolha continua disponível. `prefers-reduced-motion: reduce` foi emulado. Axe-core 4.14.0 em 320 e 375 px avaliou início, detalhe, busca, filtros e conta: zero violações nos dez estados. A suíte passou 160/160; lint/TypeScript, `format:check`, build e `git diff --check` passaram após exigir `nights` inteiro positivo em preços calculados. Build: entrada JS 361,44 kB / 108,05 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; `SearchModal` 15,96 / 4,08; detalhe 49,51 / 13,06. São tamanhos de artefatos, não Web Vitals. `.DS_Store` preexistente segue fora do Git.

Pendências naquele checkpoint: validação visual comparativa com leitor de tela e medição manual de contraste; smoke autenticado de login/sessão e checkout em staging sem concluir reserva/pagamento; entender e revalidar calendário/cotação Stays, que falharam com 503 em uma consulta anterior; avaliar allowlist depois do host observado `crcn.stays.net` e confirmar se há outros hosts legítimos; decisão sobre encaminhar `messageToHost`; preservar efeitos de logging/config antes de consolidar o GET duplicado; confirmar compatibilidade externa dos adaptadores sem consumidores internos; avaliar a composição restante de `App.tsx`. OAuth social está fora do escopo confirmado (login apenas por email e senha). Nenhuma reserva ou pagamento foi enviado.

### Continuação — 2026-10-13 (organização por domínio)

Os componentes antes soltos no diretório compartilhado foram agrupados por domínio: busca, condomínio/localização, reservas, conta, proprietário e Sofia. Cabeçalho, rodapé, logo, navegação mobile e `useDialogFocus` continuam compartilhados. Imports diretos e testes foram atualizados, mantendo os carregamentos lazy definidos em `App.tsx`. A validação passou com 156/156 testes, lint/TypeScript, `format:check`, build e `git diff --check`; o build manteve o bundle de entrada em 360,68 kB (107,85 kB gzip).

Na revisão de imagens, a API pública da Stays mostra `_t_imagesMeta`, sem definir um host CDN estável ([referência da API Stays](https://stays.net/external-api/)). O fixture sincronizado local usa `images.unsplash.com`, portanto não comprova a origem de imagens reais. A leitura pelo proxy Laravel local retornou 503 em `/api/stays/status` e `/api/resorts`; manter allowlist em aberto até obter amostra autorizada da integração. A preferência de produto é login apenas por email e senha. O campo de observação do checkout permanece como está até uma decisão sobre o envio.

### Continuação — 2026-10-13 (checagem axe e alvos de toque)

A checagem axe-core 4.14.0 em Chromium isolado (375 CSS px, início, detalhe, busca, filtros e menu da conta) encontrou alvos insuficientes nos pontos de navegação de fotos e uma divergência de nome acessível no botão flutuante da Sofia. Os botões da galeria agora mantêm pontos visuais compactos com área interativa de pelo menos 24×24 px; o acionador da Sofia usa seu conteúdo visível como nome, sem `aria-label` redundante. Após a correção, as cinco telas/estados avaliados ficaram sem violações axe. Testes cobrem área mínima e nome acessível. Commit local `bc201d9`; suíte 157/157, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: entrada JS 360,83/107,87 kB gzip; CSS 107,13/15,71. Leitor de tela e contraste medido seguem pendentes.

### Continuação — 2026-10-13 (layout mobile e axe em dois viewports)

A captura a 320 e 375 CSS px identificou a bolha fixa da Sofia sobre o botão de busca. O acesso à Sofia agora fica no cabeçalho do formulário mobile e o gatilho flutuante se oculta somente nesse contexto; o gatilho continua em páginas mobile sem atalho inline e em desktop. O cabeçalho do detalhe protege o alvo de fechar contra encolhimento a 320 px. As capturas finais mantêm documento em 320/375 px sem overflow e CTA totalmente visível. Axe-core 4.14.0 não reportou violações em início, detalhe, busca, filtros ou conta nos dois viewports; isso inclui o alvo de fechar que falhava a 320 px antes da correção. A suíte passou 160/160, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: entrada JS 361,40/108,05 kB gzip; CSS 107,13/15,71. Commit `841ab5b`.

### Continuação — 2026-10-13 (validação de preço calculado)

A auditoria de fronteiras externas encontrou que `calculatedPrice.nights` aceitava zero e frações, apesar de representar noites de hospedagem. A validação agora exige inteiro maior que zero; testes cobrem `0` e `1.5`. Commit local `cce3e5f`. Resultado: suíte 160/160, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: entrada JS 361,44/108,05 kB gzip; CSS 107,37/15,78; os demais chunks permaneceram iguais ao checkpoint anterior. Consulta GET de `/api/accommodations` não foi possível neste turno: Laravel local em `127.0.0.1:8000` recusou conexão; portanto não há confirmação de quais hosts de imagem a resposta ativa serve.

### Pendências residuais — evidência, impacto e próxima condição

| Item                                                 | Evidência e impacto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Limitação atual                                                                                                                                                                                           | Próxima condição para fechar                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewports 320/375 e jornadas completas               | Chromium isolado em 320/375 CSS px confirmou sem overflow horizontal do documento e nenhum axe violation nas cinco telas/estados em cada largura. O botão flutuante Sofia que cobria o CTA foi substituído por atalho inline durante a busca; capturas atuais mostram “Pesquisar disponibilidade” sem sobreposição e visível nos dois viewports. O botão fechar do detalhe agora não encolhe e passou no alvo mínimo a 320 px. Checagem manual posterior percorreu Tab nos diálogos de filtros e busca, confirmou o foco ainda interno após 50/40 teclas, e Escape devolveu foco ao acionador correspondente. | Não foi executado percurso completo de todos os campos e navegação móvel ponta a ponta nas larguras 320/375; a checagem manual posterior usou o viewport disponível e não override móvel.                 | Completar o roteiro manual dos formulários e navegação mobile em 320/375; revalidar após alterações de layout.                                                                                       |
| `prefers-reduced-motion`, contraste e leitor de tela | Chromium isolado confirmou `prefers-reduced-motion: reduce`; axe-core 4.14.0 reportou zero violações nas cinco telas/estados em 320 e 375 px, incluindo regra automatizada de contraste quando mensurável.                                                                                                                                                                                                                                                                                                                                                                                                    | Axe não substitui medição manual em superfícies translúcidas/gradientes e ignora casos com fundo indeterminado; não houve sessão de leitor de tela nem comparação visual entre movimento normal/reduzido. | Medir contraste manualmente em superfícies translúcidas e executar leitor de tela; comparar visualmente ambos os estados de movimento.                                                               |
| Login/sessão/checkout reais                          | Hooks e validadores têm testes com clientes/`fetch` simulados; chunk Supabase físico separado é solicitado logo após montagem para restauração da sessão. No browser local o serviço de login aparece como não configurado e a sessão está desconectada.                                                                                                                                                                                                                                                                                                                                                      | Não há sessão Supabase persistida nem smoke real com Laravel/Stays; `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão sem valor no `.env` local.                                                       | Disponibilizar runtime corretamente configurado e conta de QA; validar login por email/senha, reload/refresh, sincronização Laravel e checkout até redirect sandbox, sem concluir reserva/pagamento. |
| Calendário e cotação Stays                           | Catálogo HTTP 200, `source=stays-live`, 56/56 anúncios válidos; 56 capas e 30 fotos de um detalhe amostrado são HTTPS em `crcn.stays.net`. Calendário GET e cotação POST locais passaram para Aquarius em 13–15/10/2026: três dias disponíveis e duas noites por R$347. O browser mostrou estado sincronizado e CTA habilitado, mas não acionado.                                                                                                                                                                                                                                                             | Uma única acomodação/período não valida todo o catálogo; o OpenAPI não garante domínio fixo de mídia.                                                                                                     | Ampliar amostras de disponibilidade e hosts de mídia; manter a validação HTTP(S) genérica até confirmação oficial de allowlist. Nunca concluir compra/reserva nem enviar pagamento.                  |
| Checkout e autenticação                              | O campo `messageToHost` permanece no modal e não é enviado em `createCheckout`. Produto confirmou login somente por email/senha e pediu manter o campo atual enquanto decide seu destino.                                                                                                                                                                                                                                                                                                                                                                                                                     | O contrato backend/Stays para encaminhar a observação não foi confirmado.                                                                                                                                 | Manter o comportamento atual; alterar o encaminhamento só após decisão explícita de produto/contrato. OAuth social está fora do escopo.                                                              |
| Hosts de imagem                                      | Laravel local: 56/56 capas de `stays-live` e 30/30 fotos em um detalhe amostrado são HTTPS em `crcn.stays.net`, sem URL inválida; OpenAPI diz somente “image uri”.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Um detalhe e as capas atuais não cobrem todos os campos e futuras integrações. A especificação não declara allowlist oficial; rejeitar hosts desconhecidos pode quebrar mídia legítima.                   | Ampliar observação a avatares, reservas e anúncios em amostras futuras; só codificar allowlist quando Stays confirmar os domínios suportados. Manter HTTPS como recomendação para novos contratos.   |
| Texto alternativo e prioridade de imagens            | Inspeção estática confirmou botões de galeria com nome acessível e imagem decorativa `alt=""`, mosaico do mapa oculto da árvore, imagem principal de reserva com alt de título e cadastro com alt do preset. `PropertyCatalogGrid` passa prioridade alta/eager só ao primeiro card; os demais são lazy.                                                                                                                                                                                                                                                                                                       | Não foi medida prioridade real de rede nem LCP, e não se alega Web Vital.                                                                                                                                 | Sem correção estática identificada; revalidar em futura mudança visual e medir rede/LCP somente se desempenho for objetivo.                                                                          |
| GET duplicado e adaptadores sem consumidor           | `useAccommodationCatalog` mantém `staysApi.fetchListings()` e `crcnBackendApi.getAccommodations()`; o primeiro persiste configuração/log além do catálogo. `testConnection` e `calculatePrice` do adaptador legado não têm callsites internos encontrados.                                                                                                                                                                                                                                                                                                                                                    | Não há especificação sobre consumidores externos nem se log/config continua requisito.                                                                                                                    | Mapear consumidores e efeitos requeridos antes de remover/consolidar métodos ou chamadas.                                                                                                            |
| Composição restante do `App.tsx`                     | Ações de conta/reserva, ações de overlay, favoritos, catálogo derivado, composição de views e overlays foram extraídas. `App.tsx` agora tem 280 linhas; header, navegação e closures simples de fechar modais ainda ficam no componente.                                                                                                                                                                                                                                                                                                                                                                      | Não há regressão funcional identificada; trata-se de manutenção/legibilidade.                                                                                                                             | Revisar se o wiring restante representa uma responsabilidade coesa antes de qualquer extração adicional.                                                                                             |

### Continuação — 2026-10-13 (falha de calendário, imagens externas e movimento reduzido)

A reauditoria da resposta Laravel encontrou três campos adicionais de imagem sem filtragem: `propertyImage` das reservas do hóspede e da reserva do proprietário, e `image` das propriedades do painel. O serviço frontend agora limpa URLs inválidas nesses campos usando o mesmo critério HTTP(S) do catálogo, sem rejeitar o registro nem mudar o contrato. Testes cobrem protocolo `javascript:`, URL `data:`, caminho relativo e preservação de URL válida. No hook de disponibilidade do detalhe, rejeição da chamada de calendário agora encerra o estado de loading, limpa dados antigos e mostra a mensagem de indisponibilidade já usada para resposta vazia; teste de regressão cobre a Promise rejeitada. A regra `prefers-reduced-motion` também redefine `will-change` da `.category-filter-track` para `auto`; o teste estático confirma a regra CSS. Nenhuma API remota foi chamada nesta etapa.

Validação no commit `c233570`: teste direcionado 16/16; `npm run lint`, `npm run format:check`, `npm test` 153/153, `npm run build` e `git diff --check` passaram. Build: entrada JS 360,51/107,80 kB gzip; CSS 107,04/15,70; Supabase 226,85/58,83; detalhe 49,50/13,06. A verificação da regra CSS não substitui comparação visual com media query emulada. Revisão de contraste, leitor de tela e viewport estreito continuam pendentes.

### Continuação — 2026-10-13 (preferências locais e auditoria de teclado no browser)

A leitura de `hospeda_wishlist` foi extraída para `src/utils/savedPropertyIds.ts`: JSON inválido, formato incorreto e entradas não string deixam de quebrar a montagem; IDs de demonstração continuam sendo filtrados e a lista padrão existente é preservada. Dois testes cobrem fallback e entradas mistas. No browser local, detalhe, busca e filtros fecharam por Escape e devolveram foco aos acionadores; as tabs da busca responderam às setas; o foco do diálogo de filtros permaneceu contido com Tab/Shift+Tab. API Laravel inativa mostrou erro de calendário e manteve indisponível o botão de reserva.

Limitação da auditoria manual: o perfil Playwright compartilhado permanece ocupado; capturas e axe foram executados com Chromium isolado/CDP. O axe passou nas dez combinações de tela/estado e viewport, mas não substitui leitor de tela nem medição manual de contraste em superfícies translúcidas. O modo reduzido foi emulado, porém sem comparação visual sistemática lado a lado. Porta 3000 respondeu; Laravel em 8000 não respondeu durante a checagem anterior. Nenhuma reserva/pagamento foi iniciado.

Validação após `bdf1ca6`: `npm test` 156/156, lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 360,68/107,85 kB gzip; CSS 107,08/15,71; Supabase 226,85/58,83; detalhe 49,50/13,06. São tamanhos de artefatos, não métricas Web Vitals.

### Continuação — 2026-10-13 (hook de favoritos)

O estado persistente de favoritos saiu do `App.tsx` para `src/hooks/useSavedPropertyIds.ts`, que carrega IDs validados, persiste atualizações e alterna IDs usando setter funcional. O teste do hook comprova hidratação de storage misto, inclusão, remoção e persistência; os testes do utilitário cobrem JSON malformado, tipo inesperado e filtro de IDs demo. O `App.tsx` caiu de 494 para 479 linhas.

Validação após `bdf1ca6`: teste direcionado 3/3; `npm run lint`, `npm run format:check`, `npm test` 156/156, `npm run build` e `git diff --check` passaram. Build: entrada JS 360,68/107,85 kB gzip; CSS 107,08/15,71; Supabase 226,85/58,83; detalhe 49,50/13,06. Sem alegações de Web Vitals.

### Continuação — 2026-10-13 (bootstrap de sessão Supabase)

O bootstrap Supabase saiu do `App.tsx` para `src/hooks/useSupabaseSession.ts`. O hook preserva o carregamento dinâmico do cliente, restauração de sessão, callback de recuperação de senha, aviso de confirmação de e-mail, propagação de sessão e unsubscribe no unmount. O loader injetável permite testar esses comportamentos com cliente simulado, sem credenciais nem chamadas externas. Três testes cobrem sessão/listener/recuperação/confirmação, falha na restauração, configuração ausente e limpeza do listener. O `App.tsx` agora tem 645 linhas.

Validações no commit `29433fb`: `npm test` 134/134, `npm run lint` (ESLint + TypeScript), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: JS inicial 359,03 kB / 107,39 kB gzip; CSS 107,04 / 15,70 kB; chunk Supabase 226,85 / 58,83 kB; detalhe 49,38 / 13,05 kB. O aumento de 0,31 kB no JS inicial é pequeno e não comprova mudança de performance; Web Vitals não foram medidos. Os testes de auth usam cliente simulado: login por email/senha real, sessão persistida, checkout autenticado e leitor de tela continuam pendentes. Nenhuma reserva ou pagamento foi enviado. Naquele commit, `main` estava 106 commits à frente de `origin/main`; `.DS_Store` preexistente ficou fora do stage.

### Continuação — 2026-10-13 (revisão manual de teclado e visual)

No browser local em `http://localhost:3000/apartamento/JQ08G`, o detalhe exibiu título, imagens, seções, mapa e painel de preço no layout desktop (captura do browser: 1600×900). A árvore de acessibilidade identificou o contêiner como diálogo modal com nome pelo título e o foco inicial no botão “Fechar detalhes da acomodação”. Após navegação com Tab pelo diálogo, o foco permaneceu em controles dentro dele; Escape fechou o diálogo e, por a entrada ser um deep link sem acionador de origem, colocou o foco no contêiner principal da página. A API Laravel não estava ativa na porta 8000; calendário/quote mostraram erro explícito e a ação de continuar reserva permaneceu desabilitada. Nenhum checkout, reserva ou pagamento foi iniciado.

Escopo que esta captura não prova: leitor de tela real, foco-trap completa por percurso formal (a navegação amostral não percorreu todos os elementos), largura estreita nem reduced-motion emulado. Esses itens seguem no plano. `src/App.tsx` tem 645 linhas após a extração Supabase. A branch `main` aponta para `29433fb` e está 106 commits à frente de `origin/main` (verificado com `git status -sb`); `.DS_Store` continua não rastreado e preservado.

### Continuação — 2026-10-13 (coerência do dashboard externo)

A revisão de fronteiras de dados encontrou que a resposta Laravel do painel do proprietário aceitava `nights` diferente do intervalo entre `checkIn` e `checkOut`. Como o controller Laravel deriva esse campo das mesmas datas, `isOwnerDashboardData` agora rejeita a inconsistência calculando a diferença em dias UTC, sem mexer no contrato ou na regra autoritativa do backend. O teste existente de validação inclui um intervalo de duas noites com `nights: 3` e exige rejeição.

Validação desta etapa: o teste direcionado passou (2/2), `npm test` passou (134/134), lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 359,15 kB / 107,43 kB gzip; CSS 107,04 / 15,70 kB gzip; Supabase 226,85 / 58,83 kB gzip; `PropertyDetailModal` 49,38 / 13,05 kB gzip. Diferenças de tamanho não são métrica de Web Vitals. Restam pontos identificados na auditoria de adaptadores legados e de atributos opcionais do catálogo; serão confirmados contra consumidores e contratos antes de alterar comportamento. Esta etapa foi commitada em `0222916`.

### Continuação — 2026-10-13 (limite da escala de avaliações externas)

A revisão dos consumidores confirmou que notas e categorias são apresentadas em escala de 5 e que o normalizador Stays já rejeita valores acima dessa escala. `isProperty` agora rejeita avaliações e notas de categoria não finitas, negativas ou acima de 5. Testes de regressão cobrem 5,1 nos dois campos. A validação do modelo `Property` em uso ficou alinhada à representação da interface; taxas opacas não foram restringidas porque não há consumidor desses itens no catálogo, e `authorAvatar` não é preenchido pelo normalizador nem usado na seção de avaliações.

`npm test` passou 134/134; `npm run lint`, `npm run format:check`, `npm run build` e `git diff --check` passaram. O tamanho do build segue registrado no checkpoint corrente; nenhuma métrica de Web Vitals foi inferida. A auditoria do adaptador legado permanece limitada aos métodos sem consumidores (`testConnection` e `calculatePrice`); qualquer remoção depende de decidir se a compatibilidade administrativa ainda é necessária. A mudança foi commitada localmente após revisar o diff e repetir os gates; não houve push.

### Continuação — 2026-10-13 (viewport estreito e filtros por teclado)

Em Chromium, a tentativa de viewport 375×812 foi limitada pelo navegador a 469 CSS px. Nessa largura, o detalhe `/apartamento/JQ08G` e o painel “Filtros” não tiveram overflow horizontal (`document.documentElement.scrollWidth === innerWidth === 469`). O foco permaneceu dentro do diálogo de filtros durante amostragem de Tab; Space alternou o filtro “1+” e uma segunda ativação restaurou a seleção anterior. Escape fechou o modal. A árvore acessível expôs nome do diálogo, controles de preço, tipo de acomodação, quartos/banheiros, comodidades e opções de reserva. Isso é amostragem, não percurso completo de foco ou certificação de leitor de tela. O sinal `prefers-reduced-motion` permaneceu `false`; emulação visual e contraste seguem pendentes. A viewport temporária foi restaurada ao final.

### Checkpoint anterior — 2026-10-13 (navegação e mapa dos hotspots)

HEAD de referência antes deste checkpoint: `8d4cc91`, `main` 101 commits locais à frente de `origin/main`; worktree sem alterações rastreadas e com `.DS_Store` não rastreado preexistente, preservado. O novo teste do detalhe elevou a suíte a 120/120. A navegação móvel agora expõe `resolveMobileNavigationTarget`, testado para proprietário aprovado/pendente e para rotas de reservas/favoritos; `App.tsx` delega a decisão de rota ao componente existente. Não muda o estado de autenticação, as rotas ou o gate: a rota `host` é renderizada pelo mesmo callback apenas quando `ownerAccessStatus === 'approved'`.

Este checkpoint dá por concluída a decomposição de `PropertyDetailModal` como fronteira de controlador: apresentação de cabeçalho, fotos/ações, seções, painel de reserva, diálogos, hook de disponibilidade/preço e regra pura de seleção estão separados; o modal coordena estado compartilhado de datas/hóspedes/galeria e impõe a guarda `stays-live` + intervalo disponível antes de chamar o callback. O teste de integração confirma o payload de reserva e que estado indisponível não chama callback. Não se extraiu a política de limite de bebês, pois não foi encontrada fonte de domínio que sustente mudar ou generalizar esse limite. `App.tsx` permanece 858 linhas e passa a ser o hotspot ativo.

Mapa para a decomposição de `App.tsx` sem mover responsabilidades em lote: (1) persistência e carregamento de catálogo Stays/cache local (`properties`, `catalogLoading`, `catalogLoadError`, `handlePullStaysApartments` e efeitos de hidratação); (2) sessão/conta/proprietário e carregamento de reservas (listener Supabase, `getSession`, reservas, acesso e admin); (3) navegação e URL (deep-link `/apartamento/:id`, `popstate`, sincronização de filtros, seleção/fechamento de detalhes e acesso proprietário); (4) busca/descoberta (filtros, categorias, catálogo de condomínios, busca datada/surpresa); (5) composição das views e diálogos. Dependências críticas a preservar: ordem e cancelamento de efeitos, `localStorage` e precedência do catálogo, import assíncrono do Supabase, `access_token` em chamadas autenticadas, payload Stays de datas/hóspedes, cache e URL profunda, histórico do navegador e reconfirmação/guarda antes do checkout. Primeiro corte recomendado é hook de catálogo com testes de precedência/cache/cancelamento; não combinar com auth nem URL.

Validações deste checkpoint: `npm test` 121/121, `npm run lint` (ESLint + TypeScript), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: entrada JS 358,18 kB / 107,12 kB gzip; CSS 107,04 / 15,70 kB gzip; Supabase 226,85 / 58,83 kB gzip; modal de propriedade 49,38 / 13,06 kB gzip. Diferenças contra a etapa anterior são mínimas e não demonstram ganho de performance; não há Web Vitals medidos. Nenhuma autenticação foi iniciada e nenhum checkout/reserva/pagamento foi enviado. O navegador em viewport estreito e desktop foi verificado no checkpoint anterior, não repetido nesta etapa.

### Continuação — 2026-10-13 (hook de catálogo)

O estado/efeitos do catálogo de acomodação foram isolados em `src/hooks/useAccommodationCatalog.ts`, reduzindo `App.tsx` sem mover autenticação, busca, URL ou regras de reserva. O hook cobre cache inicialmente aceito apenas quando `hospeda_properties_source` é `stays-live`, remoção de IDs demo, filtragem de imagens não HTTP(S), substituição por catálogo retornado, fallback do catálogo empacotado quando vazio, estado de erro/loading, persistência de alterações posteriores e descarte de respostas após unmount. A hidratação de cache agora passa cada item por `isProperty`; registros malformados deixam de entrar no estado tipado. Testes cobrem cada ramo principal. O fluxo preserva os dois consumidores existentes de `/api/accommodations`: `staysApi.fetchListings()` (também grava configuração/log da integração) e `crcnBackendApi.getAccommodations()` (fonte do catálogo/fallback). Eles fazem GETs duplicados na montagem; foram mantidos porque a remoção exigiria alterar/combinar efeitos colaterais do serviço legado, fora do escopo deste recorte. Próxima decisão técnica: avaliar consolidação em etapa própria, após especificar se o log/config da integração ainda é requisito.

Desde `90a89ef`, `main` estava 102 commits locais à frente de `origin/main`; o `.DS_Store` preexistente permanece fora do stage. `npm test` 125/125, `npm run lint` sem avisos (ESLint + TypeScript), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: entrada 358,37 kB / 107,13 kB gzip; CSS 107,04 / 15,70 kB; Supabase 226,85 / 58,83 kB; detalhe 49,38 / 13,05 kB. O delta de bundle é artefato pequeno, sem evidência de Web Vitals. Nenhuma checagem manual de navegador foi repetida nesta etapa; autenticação/checkout e as rotas Stays indisponíveis continuam com as limitações registradas acima.

### Continuação — 2026-10-13 (roteamento de acomodação)

`useAccommodationRouting` agora concentra a resolução do deep-link `/apartamento/:id`, seleção pelo ID interno ou `staysListingId`, lookup remoto quando o detalhe não está no catálogo, restauração de filtros/consulta em `popstate`, abertura da rota ao selecionar acomodação e fechamento para `/`. A query e o hash são preservados ao abrir/fechar. O estado permanece no `App`; o hook recebe os setters e a referência de busca restaurada, sem alterar formato de URL, `parseSearchFilters`, serviço Laravel ou payload. Três testes exercitam deep-link por Stays ID, lookup remoto, histórico, filtros e preservação de query/hash.

Após `c811d54`, a suíte passou 128/128, lint/TypeScript sem avisos, `format:check`, build e `git diff --check`. `App.tsx` caiu de 798 para 737 linhas. Build: entrada JS 358,59 kB / 107,22 kB gzip; CSS 107,04 / 15,70 kB; Supabase 226,85 / 58,83 kB; detalhe 49,38 / 13,05 kB. Esses dados são tamanhos de artefato, não Web Vitals. A verificação do navegador permanece evidência do checkpoint anterior; esta etapa não repetiu smoke visual nem iniciou autenticação ou checkout.

### Continuação — 2026-10-13 (dados autenticados da conta)

As leituras autenticadas de reservas, acesso de proprietário e status admin foram isoladas em `useAccountWorkspaceData`. O listener Supabase, `getSession`, tratamento de recuperação/confirmação de e-mail e sign-out continuam no `App.tsx` sem alteração. O hook mantém `access_token` nas três chamadas, estado `loading/none/unavailable`, cancelamento em mudança de token/desmontagem e redirects ao perder acesso ou ser negado como admin. Os setters de reservas e status seguem expostos ao `App` para preservar os handlers existentes de cancelamento e solicitação de acesso. Três testes cobrem leituras com token atual, respostas obsoletas entre contas, logout e redirects.

Depois de `9dc7fe5`, `main` estava 104 commits à frente de `origin/main`. A suíte passou 131/131; lint/TypeScript sem avisos, `format:check`, build e `git diff --check` também passaram. `App.tsx` caiu de 737 para 692 linhas. Build: entrada JS 358,72 kB / 107,28 kB gzip; CSS 107,04 / 15,70 kB; Supabase 226,85 / 58,83 kB; detalhe 49,38 / 13,05 kB. São medidas do artefato, não Web Vitals. Não foram usadas credenciais nem feitos smoke tests autenticados nesta etapa; permanecem pendentes confirmação real de login por email/senha, sessão e checkout sem concluir reserva ou enviar pagamento, leitor de tela e revisão visual de movimento reduzido/contraste.

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

Foram endurecidos guards sem alterar contratos: `isProperty` exige ID/título não vazios, rating entre 0 e 5 e latitude/longitude dentro dos limites geográficos; `sanitizePropertyMedia` restringe valores de mídia a URLs absolutas HTTP(S), sem credenciais, e filtra imagens inválidas nos consumidores externos; `isReservation` exige noites iguais à diferença das datas ISO e valores financeiros não negativos. `createCheckout` compara noites da cotação com as datas solicitadas e valida listing. O contrato real do Laravel foi conferido: `quote.listingId` é ID interno do catálogo e `quote.staysListingId` é o ID externo enviado pelo cliente; a validação prioriza `staysListingId` quando existe para não rejeitar cotações legítimas. Não foi adicionada reconstrução de total/taxas, cuja regra não é estável o suficiente no contrato atual.

Testes cobrem entradas inválidas em propriedades/reservas, mismatch de listing/noites e aceitação do mapeamento interno/externo correto. Suíte completa: 112/112; lint/TypeScript, `format:check`, build, docs e `git diff --check` passaram. Build após os guards: JS inicial 357,95 kB / 107,16 kB gzip; CSS 107,04 kB / 15,70 kB; chunk modal 48,54 kB / 12,85 kB gzip. O aumento de 0,57 kB / 0,17 kB gzip no bundle inicial em relação ao checkpoint anterior corresponde à validação adicionada; nenhum Web Vital foi inferido.

### Continuação — 2026-10-13 (ações do detalhe)

`PropertyDetailActions` extraiu a apresentação dos controles compartilhar/salvar e mantém fechamento/foco no controlador. O botão de salvar agora expõe `aria-pressed`; teste cobre o callback com o ID do imóvel. Estado pós-commit: `main`, 92 commits à frente de `origin/main`; modal com 429 linhas e `App.tsx` ainda com 950. A suíte passou 109/109 e lint, format check, build e `git diff --check` passaram. Build observado: JS inicial 357,38 kB / 106,99 kB gzip; CSS 107,04 kB / 15,70 kB gzip; chunk do modal 48,54 kB / 12,85 kB gzip.

A auditoria de dados paralela apontou próximos casos para fortalecer: consistência de noites e datas em reservas, associação da cotação de checkout ao listing solicitado, e limites semânticos de título/localização/nota em propriedades. Ainda não alterados neste checkpoint; tratar com testes e sem inventar regra de cálculo financeiro.

### Continuação — 2026-10-13 (grid de fotos e revisão de dados)

Estado confirmado após a extração do grid: `main`, 91 commits locais à frente de `origin/main`, HEAD `b84a4dc`, árvore limpa. A extração do grid de fotos deixou `PropertyDetailModal.tsx` com 445 linhas e criou `PropertyPhotoGrid.tsx` (60 linhas). `PropertyBookingPanel` (184 linhas), `PropertyDetailHeader` (71 linhas), estado de galeria e diálogo continuam separados. O teste valida abertura na foto 2 e retorno de foco após Escape. Gates passaram: lint/TypeScript, 108/108 testes, format check, build, formatação dos dois planos e `git diff --check`. Build: JS inicial 357,38 kB / 107,00 kB gzip; CSS 107,04 kB / 15,70 kB; Supabase 226,85 kB / 58,83 kB; modal 48,54 kB / 12,85 kB gzip. São tamanhos de artefato, sem inferência de Web Vitals.

Auditoria de dados externos em `crcnBackendApi.ts` e `apiValidation.ts`: payloads são lidos como `unknown` e validados antes de entrar nos tipos do domínio para catálogo, detalhe, busca, calendário, preço, checkout/URL Stays, reservas, acesso de proprietário, solicitações, dashboard, status e Sofia. Os testes de `reservationApiValidation.test.ts` rejeitam respostas inválidas em preço, calendário, resorts, reservas e demais limites cobertos. Ponto residual de tolerância: `getResorts()` filtra registros inválidos e pode retornar os válidos de uma resposta mista, ocultando resorts malformados; o impacto é lista parcial de opções de filtro, não aceitação de dados inválidos. Não há contrato disponível que determine se a resposta deve ser atômica; manter como monitoramento até evidência de payload misto real ou regra de API.

A verificação visual desktop/375×812 e o erro de disponibilidade permanecem documentados no checkpoint anterior. Login por email/senha, sessão e checkout autenticado, leitor de tela e emulação visual de reduced motion seguem pendentes. Nenhuma compra/reserva foi concluída e nenhum pagamento foi enviado.

### Continuação — 2026-10-13

Estado confirmado antes desta etapa: `main` limpa, 87 commits locais à frente de `origin/main`, HEAD `2cabab8`. Depois das extrações do painel e cabeçalho, `PropertyDetailModal.tsx` tinha 487 linhas; `PropertyDetailHeader.tsx` 71, `PropertyBookingPanel.tsx` 184 e `App.tsx` permanece em 950. A suíte passou 108/108; lint/TypeScript, `format:check`, build e `git diff --check` passaram. Build: JS inicial 357,38 kB / 106,99 kB gzip; CSS 105,83 kB / 15,63 kB; Supabase 226,85 kB / 58,83 kB; `PropertyDetailModal` 48,05 kB / 12,75 kB gzip. O chunk do modal aumentou 0,12 kB porque agora inclui a unidade carregada; o corte melhora separação de responsabilidade e não é apresentado como otimização de bundle.

O novo `PropertyDetailHeader` mantém título, avaliação e localização, delegando apenas a apresentação e o callback para rolar até as avaliações. O grid de fotos também foi extraído para `PropertyPhotoGrid`, sem estado interno; o teste da galeria agora verifica abertura direta na foto 2 e restauração do foco ao acionador após Escape. Um teste confirma o título como H1 e o acionamento da rolagem. Nenhuma regra de reserva, preço, autenticação ou contrato foi movida. A extração está validada, mas ainda é necessário terminar o hotspot antes de iniciar `App.tsx`.

Revisão visual em navegador desktop e 375×812: a página não tem overflow horizontal e o detalhe reorganiza galeria e painel em coluna. Com Laravel indisponível, calendário/preço exibem erro e CTA fica bloqueada. O botão desabilitado usava texto branco sobre gradiente com opacidade reduzida; foi ajustado para superfície neutra, texto escuro e sem sombra, preservando `disabled` e a mensagem “Valores indisponíveis” como explicação. O teste cobre estado disabled e estilos neutros. Ainda não há confirmação com leitor de tela, emulação visual de reduced motion ou auditoria sistemática de contraste sobre superfícies de vidro.

Estado confirmado antes desta etapa: branch `main` limpa, 86 commits locais à frente de `origin/main`, HEAD `ec4874c`. `PropertyDetailModal.tsx` tinha 614 linhas e `App.tsx` 950. Após extrair o painel de reserva, o modal tem 529 linhas e `PropertyBookingPanel.tsx` 184; `App.tsx` segue com 950. O build após a extração produz JS inicial 357,38 kB / 107,00 kB gzip; CSS 107,04 kB / 15,70 kB gzip; chunk Supabase 226,85 kB / 58,83 kB gzip; chunk `PropertyDetailModal` 47,93 kB / 12,69 kB gzip. São tamanhos de build, não Web Vitals.

A correção foi commitada localmente em `1c6a61b` (`fix(a11y): restore focus after deep-linked detail dialog`); a branch ficou 85 commits à frente de `origin/main`, sem push. Em nova sessão Chromium na aplicação atual, a rota direta abriu o modal e Escape fechou-o, restaurou `/` e deixou o foco no contêiner principal.

Esta rodada confirmou manualmente em Chromium desktop o detalhe acessado por deep-link `/apartamento/JQ08G`, foco inicial nomeado, fechamento de diálogo aninhado por Escape e estado fechado para reserva quando calendário/preço falham com Laravel indisponível. O fluxo catálogo → detalhe já retornava foco ao acionador. A auditoria encontrou e corrigiu o caso deep-link: ao fechar o detalhe sem acionador prévio, o foco agora retorna ao elemento `<main>`; o teste dedicado cobre esse fallback. Uma execução concorrente causou falha transitória em teste de UI de administração; o teste isolado e a suíte completa serial passaram depois (107/107). Lint/TypeScript sem avisos, `format:check`, build e `git diff --check` também passaram.

Na continuação anterior, a apresentação do cartão de reserva foi movida para `PropertyBookingPanel`, deixando estado, requote, calendário e montagem do payload no modal. O teste do modal confirma que a ação de reserva segue desabilitada sem preço/disponibilidade ao vivo. `npm test` passou 107/107; lint/TypeScript, `format:check`, build e `git diff --check` passaram. A extração não altera contratos ou endpoints.

Nesta etapa foi extraído `PropertyDetailHeader`; `npm test` passou 108/108 e os demais gates também passaram. O teste cobre H1 nomeado e callback de navegação à seção de avaliações. Ainda faltam testes manuais de leitor de tela/viewport estreito e a revisão final do restante do modal.

O inventário estático de movimento não encontrou animações que escapem do `prefers-reduced-motion` global. Ainda faltam comparação visual com reduced motion, leitor de tela, smoke de login por email/senha, sessão e checkout autenticado e revisão visual completa de contraste. O backend Laravel não estava ativo (`ECONNREFUSED 127.0.0.1:8000`); calendário e cotação mostram erro explícito e CTA desabilitada. Em 2026-10-13, navegador Chromium voltou a validar foco inicial no detalhe, galeria fecha com Escape e devolve foco à miniatura, calendário abre com foco no botão fechar, tem nome/modal e fecha com Escape devolvendo foco ao acionador; não houve overflow horizontal em 375×812 nem em 1440×900. O detalhe empilha corretamente no viewport estreito e mantém CTA desabilitada quando Laravel está desligado. Filtros completos, leitor de tela e emulação visual reduced-motion seguem pendentes.

| Área                       | Falta fazer                                                                                                                             | Evidência / condição de encerramento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decomposição               | Seguir decompondo `App.tsx` somente se houver unidade coesa, mantendo explícita a coordenação residual.                                 | `PropertyDetailModal` foi concluído como controlador: cabeçalho, fotos/ações, seções, painel, diálogos, hook de disponibilidade e regra de seleção estão separados. `App.tsx` tem 280 linhas; catálogo/cache, URL/roteamento, workspace, sessão, busca, conta, favoritos, view router, overlays e ações de overlay estão extraídos. Header, navegação e closures simples permanecem, sem coesão demonstrada para outra extração.                                                                                                                                                                                                                                                                                           |
| Acessibilidade manual      | Completar formulários/jornadas por teclado, leitor de tela e movimento reduzido visualmente.                                            | Chromium confirmou detalhe em 469×1015 CSS px sem overflow; foco inicial no botão fechar, 40 Tabs contidos e Escape do deep link retornou foco ao `<main>`. Evidência anterior de axe/overflow cobre cinco telas em 320 e 375 CSS px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Percorrer formulários e navegação em 320/375, medir contraste manualmente, executar leitor de tela e comparar screenshots em movimento normal/reduzido. Browser desta sessão não aplicou override 375×812. |
| Autenticação e checkout    | Verificar callback de autenticação, restauração da sessão e navegação apenas até redirect sandbox.                                      | Exige runtime Supabase configurado e sessão/conta de QA. No checkout local, URL e anon key estão sem valor; não foi possível executar fluxo autenticado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Disponibilizar ambiente de QA e validar login por email/senha, reload, sincronização Laravel e redirect sandbox. Parar antes de criar reserva/pagar. OAuth social segue fora do escopo confirmado.         |
| Stays ao vivo              | Ampliar amostra de catálogo, calendário e cálculo de preço.                                                                             | Laravel e proxy Vite responderam 200 para catálogo e uma amostra de calendário/cotação Stays; Aquarius Flat Apto B 301, 13–15/10/2026, retornou três dias disponíveis e R$347. CTA habilitado não foi acionado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Repetir em outras acomodações/períodos e verificar mídia de avatares/reservas; não concluir reserva/pagamento nem definir allowlist sem contrato de host.                                                  |
| Visual e movimento         | Rever tokens nas jornadas restantes, contraste e reduced motion emulado lado a lado.                                                    | `src/index.css` e testes cobrem reduced motion; emulação foi confirmada em sessão Chromium anterior. 320/375 passou axe nas cinco telas/estados; não há medição manual completa de contraste nem comparação visual pareada. Sem alegações de Web Vitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Medir contraste em superfícies translúcidas/gradientes e comparar as mesmas telas em `no-preference`/`reduce`, além de concluir a leitura assistiva.                                                       |
| Convenções e dados         | Encerrar decisões residuais de tolerância e validar em staging quando disponível.                                                       | A fronteira ativa rejeita noites divergentes das datas, reservas com valores negativos, reviews/notas acima de 5, campos semânticos inválidos de propriedade e cotação vinculada ao imóvel/noites divergentes; testes correspondentes passam. `getResorts()` tolera resposta mista filtrando entradas inválidas e pode mostrar lista parcial; impacto limitado aos filtros de condomínio, sem contrato que determine atomicidade. Campos opcionais sem consumidor e `staysApi.testConnection/calculatePrice` sem consumidores internos não são endurecidos/removidos sem evidência de contrato externo. `quote_changed` não tem breakdown no contrato Laravel; `propertyCount` ausente já é apresentado como indisponível. |
| Organização de componentes | Migrar o domínio de acomodação para `src/components/property/` em passos por domínio, preservando componentes compartilhados fora dele. | A primeira migração moveu cartões, catálogo, detalhe e subcomponentes do imóvel; imports, testes e lista incremental do Prettier foram atualizados. Rever os demais domínios somente em etapas com benefício claro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Essa revisão não encontrou motivo para alterar dependências ou contratos. Os itens dependentes de acesso externo devem terminar com evidência da tentativa e decisão necessária, não com uma alegação de conclusão técnica.

| Fase                              | Estado                                                      | Evidência / pendência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — padrão de diálogo             | Implementada; validação manual parcial                      | Testes automatizados cobrem foco inicial, contenção de Tab, Escape, retorno do foco e controles em portais fora do DOM do diálogo. Em Chromium local, detalhes e diálogos aninhados de hóspedes, datas e galeria abriram com nome/foco esperados; Escape fechou a camada superior e restaurou foco ao acionador. Outros fluxos seguem pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1 — acessibilidade                | Em andamento; fixes priorizados com testes                  | Busca, filtros, checkout, cadastro, conta, suporte, condomínio, detalhe e cartões receberam melhorias anteriores. Nesta continuação: `FilterModal` ressincroniza o rascunho após reset externo (teste de regressão); diálogos de voucher/cancelamento em `TripsView` agora têm nome, semântica modal, foco inicial/retorno e Escape; Sofia tem campo e envio nomeados, log `aria-live` e rolagem que respeita movimento reduzido; menu Minha Conta expõe seu estado, controle associado e fecha por Escape com retorno de foco; navegação do painel de proprietário informa seção atual e anuncia carregamento; calendários e seletores portaled do widget Stays ficam no ciclo de foco do diálogo; navegação mobile tem landmark nomeado, `aria-current="page"` e teste de acesso condicional ao painel do proprietário; filtros e alternância mapa/lista em `CategoryBar` mantêm nomes acessíveis em viewport estreito, e a paginação informa a posição atual; dias dos calendários Stays e de reserva no detalhe anunciam data completa; os acionadores do calendário do detalhe expõem corretamente o campo aberto, e a seleção Check-in/Check-out anuncia seu estado. Testes automatizados cobrem seleções e retorno de foco; revisar jornadas restantes, navegador e leitor de tela. |
| 2 — tipos e dependências          | Concluída para o escopo auditado                            | TypeScript estrito agora checa frontend, `server.ts` e testes via `tsconfig.json`; declaração local mínima tipa o uso existente de jsdom. npm é o único gerenciador; payloads externos seguem validados, incluindo agora o formato, datas, status e números da resposta do dashboard Laravel de proprietário.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3 — bundle e carregamento         | Chunk inicial medido; jornada de auth pendente              | Build no commit de código `3023933`: JS inicial 365,39 kB/108,86 kB gzip; CSS 107,37/15,78; Supabase 226,85/58,83; `PropertyDetailModal` 51,65/13,84. Login por email/senha, refresh de sessão e checkout seguem sem smoke real porque os valores públicos Supabase do cliente local estão ausentes. Tamanhos não comprovam Web Vitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4 — tokens e movimento            | Parcialmente concluída                                      | Tokens de foco, página e borda de vidro; suporte global a movimento reduzido. Rolagens acionadas pela aplicação usam comportamento automático quando `prefers-reduced-motion` está ativo, incluindo Sofia, busca e avaliações. A preferência agora desativa por completo animações decorativas (incluindo ping, pulse e spin), minimiza transições e força rolagem automática; teste de regressão valida essas regras. Revisão visual de consistência e inventário das transições próprias nas telas principais continuam pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5 — decomposição dos hotspots     | `PropertyDetailModal` concluído; revisão final de `App.tsx` | `PropertyDetailModal` mantém estado compartilhado e guarda de reserva; apresentações, painel, diálogos, disponibilidade e seleção estão extraídos. `App.tsx` agora tem 280 linhas; catálogo/cache, roteamento, workspace, sessão Supabase, busca, ações de conta/overlay, favoritos, view router e camada de overlays estão separados. Header, navegação e closures simples de fechar modais permanecem; só extrair outra unidade se houver coesão demonstrável.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6 — lint, formatação, testes e CI | Gates atuais passaram; cobertura de jornadas permanece      | Reexecução em `3023933`: suíte serial 181/181, lint/TypeScript, `format:check` e build passaram; bundle JS inicial 365,39/108,86 kB gzip, CSS 107,37/15,78, Supabase 226,85/58,83, modal 51,65/13,84. O diff de código em `3023933` passou `git diff --check`; tamanho de artefato não é Web Vital. Smoke autenticado e testes manuais residuais estão descritos nesta matriz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7 — convenções permanentes        | Parcialmente concluída                                      | `AGENTS.md` direciona para este plano e descreve critérios de acessibilidade, tipos, tokens, movimento, API, imagens e testes; README documenta comandos e CI. A matriz de encerramento desta auditoria relaciona cada critério do checklist a evidência, impacto e pendência/decisão. Os guias foram realinhados neste checkpoint; aplicar e verificar o checklist novamente na próxima feature real continua sendo prática contínua, fora do escopo de uma mudança específica nesta sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Baseline histórico (2026-10-13)

Checkpoint 2026-10-13: `npm run lint`, `npm test` (105/105), `npm run format:check`, `npm run build` e `git diff --check` passaram. Build: JS inicial 357,30 kB / 106,96 kB gzip; CSS 105,55 kB / 15,57 kB gzip; Supabase 226,85 kB / 58,83 kB gzip; chunk `PropertyDetailModal` 47,23 kB / 12,53 kB gzip. São tamanhos de build, não Web Vitals. Login por email/senha, sessão e checkout seguem dependendo de navegador com ambiente autenticado; não realizar reserva nem pagamento.

### Evidência de bundle (2026-10-12)

Build reproduzido com sourcemaps em `/tmp/hospeda-reservas-bundle-report` (artefato temporário, fora do repositório): chunk inicial 570,26 kB minificado / 162,20 kB gzip. O mapa aponta React DOM (runtime), Supabase Auth e Supabase Storage/PostgREST entre as maiores contribuições. `App.tsx` consulta a sessão no início e checkout/conta também usam auth; um `import()` chamado no início só deslocaria código para outro arquivo, sem reduzir bytes transferidos. Não introduzir divisão manual do Supabase sem redesenhar e testar a jornada de inicialização de auth. `PropertyDetailModal.tsx` é 45,18 kB minificado no build atual e já é chunk carregado sob demanda; sua decomposição é prioritariamente manutenção, não redução do chunk inicial. As extrações de preço, avaliações, comodidades e políticas mantêm o chunk inicial em 570,21 kB / 162,16 kB gzip.

### Medição após isolar o SDK Supabase (2026-10-12)

Na build de produção, o chunk de entrada passou de 575,18 kB / 163,69 kB gzip para 348,34 kB / 104,42 kB gzip (redução de 226,84 kB / 59,27 kB gzip, aproximadamente 39% / 36%). `dist/index.html` referencia apenas o chunk principal; o JS principal contém uma importação dinâmica `supabase-*.js`, cujo arquivo mede 226,85 kB / 58,83 kB gzip. `App` agenda essa importação após a primeira renderização para associar listeners e restaurar sessão; os fluxos de login e checkout também continuam podendo carregar o módulo sob demanda. Isso comprova a redução do chunk síncrono e da análise inicial de JS; o total de bytes permanece praticamente igual quando a autenticação é restaurada e o chunk separado baixa logo em seguida. Não há medição real de LCP/INP/CLS. O navegador embutido estava sem servidor local (`ERR_CONNECTION_REFUSED`), então login por email/senha, sessão persistida e checkout precisam de smoke test visual posterior.

### Revisão manual no navegador (2026-10-12)

Em `http://localhost:3173/`, Chromium carregou o catálogo local sem erros de console. O modal de detalhes anunciou o título e moveu foco ao botão fechar. Hóspedes, calendário e galeria abriram como segundo diálogo acessível; Escape fechou a camada superior e restaurou foco ao acionador. Galeria respondeu às setas. Avaliações e comodidades renderizaram seus títulos/grupos; regras/políticas anunciaram heading de seção e subtítulos nível 4. Em viewport CSS de 375 px, `documentElement.scrollWidth` também foi 375 px e o detalhe não teve overflow horizontal. A API local não confirmou disponibilidade e o diálogo exibiu o estado existente “Não foi possível confirmar a disponibilidade”; checkout não foi acionado. Esta verificação cobre a jornada do modal em navegador, não substitui leitor de tela nem validação dos outros fluxos.

Na sequência, com os componentes de localização/anfitrião extraídos, inspeção no Chromium desktop confirmou uma role `dialog`, os títulos “Onde você estará” e “Hospedado por Central de Reservas Caldas Novas”, um iframe de mapa e o link “Abrir no Google Maps”. O backend Laravel recebeu credenciais Stays carregadas apenas no processo a partir do `.env` privado do workspace. `GET /api/stays/status` confirmou conexão; `GET /api/accommodations/JQ08G` respondeu, mas as consultas de calendário e preço para o listing selecionado retornaram `calendar_unavailable`/`quote_unavailable` (503), e chamadas diretas aos paths correspondentes no serviço Stays responderam 404. A navegação detalhada não foi reaberta após esse diagnóstico; a API deve ser investigada separadamente antes de afirmar disponibilidade/cotação ao vivo. A sessão atual não expôs controle de viewport, portanto nenhuma nova verificação móvel foi feita para esta extração.

### Revisão manual atual (2026-10-13)

Vite foi iniciado localmente em `http://localhost:3000/apartamento/JQ08G` porque a URL anterior na porta 3173 recusava conexão. No viewport fornecido pelo navegador (571 × 910 CSS px), a busca, os cartões e o modal de detalhes carregaram com conteúdo de cache; `documentElement.scrollWidth` foi 571 px, igual à largura do cliente, sem overflow horizontal. O diálogo de detalhes anunciou o nome da acomodação; ao abrir e fechar com `Escape`, saiu da árvore de diálogos e devolveu o foco ao botão “Ver detalhes de Lacqua DiRoma IV”. A galeria abriu e fechou pelo botão nomeado. Na primeira abertura, o proxy Vite registrou `ECONNREFUSED 127.0.0.1:8000`, pois o backend não estava ativo; os fallbacks permitiram revisar a interface sem overflow.

Depois, Laravel foi iniciado na porta 8000 com as variáveis Stays carregadas somente no processo. `GET /api/health` respondeu 200; `GET /api/stays/status` confirmou conexão. Os GET documentados de condomínios e detalhe funcionaram: `GET /api/resorts` retornou 26 itens de `stays-live` e `GET /api/accommodations/JQ08G` retornou o imóvel sincronizado. A verificação de calendário para `2026-10-13` a `2026-10-15` falhou: o GET Stays documentado `/calendar/listing/JQ08G` retornou 404, traduzido pelo backend em `calendar_unavailable` (503). A consulta de preço para o mesmo período e um hóspede também falhou: o POST de leitura documentado `/booking/calculate-price` retornou 404, traduzido em `quote_unavailable` (503). A suíte de integração não prova disponibilidade nem cotação ao vivo enquanto esses endpoints permanecerem 404. A resposta estimada local observada sem credenciais não é preço autoritativo.

Leitor de tela, login por email/senha com sessão autenticada e checkout sem concluir reserva continuam sem validação; não foram inseridos dados de login nem iniciada transação. A inspeção desktop documentada em 2026-10-12 permanece como evidência histórica, sem repetição nesta sessão.

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

1. Concluir navegação por teclado em busca/filtros; repetir emulação visual de reduced-motion e registrar contraste com método verificável. A largura estreita teve evidência a 375×812 em checkpoint anterior e 469 CSS px nesta continuação.
2. Executar smoke de login/cadastro por email e senha, restauração de sessão e percurso de checkout somente até antes de criar reserva/pagar, se houver sessão de QA autorizada; sem ambiente autenticado, registrar a dependência e impacto.
3. Documentar a tolerância de lista parcial de `getResorts()` como decisão explícita e manter métodos/atributos sem consumidores como residuais até verificar compatibilidade externa; evitar mudanças de regras PMS/financeiras sem evidência.
4. Revisar se a duplicidade GET do catálogo pode ser consolidada sem perder logging/configuração do serviço legado; manter quando a semântica do side effect não puder ser preservada.
5. Manter `App.tsx` como raiz de composição após as extrações concluídas; reabrir a decomposição somente quando uma nova regra de negócio ou família coesa justificar módulo próprio.

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

## Atualização da auditoria — títulos públicos e estado vigente (2026-10-13)

O código vigente passou a formatar títulos somente na apresentação: remove o prefixo de marca `CRCN -`, expande `Apto`/`Apt` para `Apartamento` e padroniza separadores. Os campos de origem continuam intactos para busca, IDs, integração Stays e reservas. A formatação cobre cards, detalhe e galeria, mapa, assistente, checkout e viagens. Commits locais: `34292a0` e `bb6da88`.

Evidência: leitura GET somente leitura, via cliente Laravel existente, consultou 56 anúncios Stays. Para LG11J, o título público era `CRCN - Ecologic Ville - Apto 801 A`, enquanto o nome interno era `Ecologic Ville - 801 A`; outros anúncios usam nomes internos abreviados ou incluem observações operacionais, portanto eles não são uma fonte pública consistente para substituição em lote. Chromium local exibiu `Ecologic Ville – Apartamento 801 A` no card e como H1 do detalhe `LG11J`; detalhe continuou em diálogo nomeado e não foi iniciado checkout/reserva. Quatro testes cobrem prefixo, `Apto`, `Apt`, espaços e preservação do valor de origem. A suíte serial passou 185/185; o arquivo de validação de API que falhou em uma execução sob gates concorrentes passou isoladamente e na repetição serial. `npm run lint`, `npm run format:check`, build e `git diff --check` passaram. Build: JS inicial 365,57 kB / 108,92 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; detalhe 51,67 / 13,85.

Na mesma inspeção visual, a descrição live de LG11J continha o texto malformado “O apartamento de no edifício Ecologic Ville”. Isso é conteúdo da ficha Stays; não foi alterado automaticamente nem enviado à API. Requer revisão editorial no cadastro de origem antes de qualquer correção que modifique conteúdo externo.

Estado no checkpoint `bb6da88`: `App.tsx` tinha 280 linhas e `PropertyDetailModal.tsx` 412. A branch estava 158 commits à frente da referência local `origin/main`, não atualizada por fetch; `.DS_Store` seguia não rastreado e fora dos commits. A autenticação real/sessão/checkout dependia de ambiente Supabase de QA; leitor de tela, contraste medido, walkthrough completo de teclado em viewport estreito, comparação visual pareada de movimento, inspeção final dos adaptadores e decisão sobre os handlers restantes de `App.tsx` eram residuais. Sem push, merge ou deploy.

### Decisão de composição e auditoria em andamento — 2026-10-13

Em `74e03de`, `App.tsx` tem 280 linhas e atua como raiz de composição: liga hooks de catálogo, rota, sessão e conta às camadas de navegação, conteúdo e overlays. As ações de overlay já foram extraídas; os callbacks de abrir/fechar restantes são simples setters. Uma nova extração agora apenas encaminharia props sem reduzir regras acopladas. A decomposição do hotspot está encerrada por ora; reavaliar quando surgir uma regra nova ou família coesa. `PropertyDetailModal.tsx` tem 412 linhas. Neste checkpoint, a suíte serial passou 185/185; lint/TypeScript, `format:check`, build e `git diff --check` também passaram. `HEAD=74e03de` estava 160 commits locais à frente da referência `origin/main` não atualizada por fetch; `.DS_Store` continuava não rastreado. Não houve push, merge ou deploy.

O `.env` local tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` sem valor. Assim, login/cadastro por email e senha, restauração de sessão e checkout autenticado exigem ambiente e conta de QA antes de validação manual, sem iniciar reserva ou pagamento. Leitor de tela, contraste medido, percurso completo de teclado em 320/375 CSS px e comparação visual de movimento reduzido ainda carecem de evidência. A auditoria atual também examina contraste e foco em controles de categorias, além de fallback do catálogo e corridas entre requisições; estes são achados em investigação, sem correção declarada. A decisão final sobre adaptadores externos permanece pendente de evidência de compatibilidade.

### Fechamento dos pacotes paralelos — 2026-10-13

`985a070` corrigiu contraste de CTAs e textos informativos: os extremos dos gradientes orange-700 e amber-700 têm, respectivamente, contraste calculado de 5,18:1 e 5,02:1 com branco; neutral-600 sobre branco tem 7,81:1. O carrossel revela setas com foco dentro do card. A paginação de categorias retira da ordem de Tab os itens fora da janela, oculta esses itens da árvore acessível e move o foco para a primeira categoria da nova página; teste de interação cobre as três páginas. As razões foram calculadas para cores sólidas; composição visual em todas as superfícies translúcidas e validação por leitor de tela ainda requerem inspeção prática.

`8cec926` removeu o GET inicial duplicado do catálogo, separou a persistência do catálogo live dos resultados de busca, impediu resposta tardia de catálogo/busca de sobrescrever busca mais recente e passou a propagar erro ou JSON inválido da API. Cache sincronizado antigo exibe aviso de atualização falha; resposta live vazia limpa o cache e exibe estado vazio, sem anúncios demonstrativos. O fallback de busca sem datas agora respeita propriedade, cidades e paginação; busca com datas segue sem inventar disponibilidade. Testes cobrem concorrência, falha HTTP/JSON inválido e lista vazia. Os adaptadores existentes foram mantidos por compatibilidade externa não comprovada; não remover métodos públicos sem inventário de consumidores. Mídias observadas na amostra Stays usam `crcn.stays.net`, mas o OpenAPI não fixa o host; manter validação HTTPS/URL sem credenciais e só restringir hosts após evidência contratual ou amostra ampliada.

Gates no checkout integrado: `npm run lint`, `npm run format:check`, `npx tsx --test --test-concurrency=1 tests/*.test.ts` (193/193), `npm run build` e `git diff --check` passaram. Build: JS inicial 360,85 kB / 107,50 kB gzip, CSS 108,52 / 15,83, Supabase 226,85 / 58,83 e detalhe 51,67 / 13,86. Comparado ao checkpoint anterior, o JS inicial caiu 4,72 kB / 1,42 kB gzip; são tamanhos de artefato, não Web Vitals. Os commits são locais, sem push, merge ou deploy.

Residuais explicitados: o `.env` local não configura o cliente Supabase, então login por email/senha, sessão persistida e checkout autenticado não podem receber smoke manual confiável aqui; decisão: usar ambiente/conta de QA e parar antes de criar reserva ou pagar. Leitor de tela e walkthrough integral de teclado em 320/375 CSS px não foram executados nesta rodada; testes de foco e verificações anteriores de viewport/axe são evidência parcial, e a decisão é completar esses percursos quando houver sessão de browser e tecnologia assistiva disponíveis. O CSS contém regra `prefers-reduced-motion` e houve emulação em checkpoint anterior, mas não comparação visual pareada nesta rodada; decisão: manter suporte e registrar comparação manual antes de afirmar equivalência visual. O texto malformado de LG11J é dado editorial Stays e precisa correção na origem. Nenhuma dessas lacunas justifica alterar contratos de autenticação, Stays ou reserva no frontend.

### Continuação da auditoria — busca datada e filtros de preço (2026-10-17)

A documentação da Stays descreve `/booking/search-listings` como fonte de anúncios reserváveis para o intervalo e apresenta `bookingPrice` como cotação. O backend agora preserva resultados reserváveis sem total válido, mas omite `calculatedPrice`; assim, o frontend mostra preço ainda não confirmado em vez de interpretar o objeto sintético de total zero como preço indisponível. A busca mantém o anúncio visível, e nenhuma disponibilidade foi inferida a partir do preço.

Na visualização por condomínios, os estados de loading e erro de uma busca datada agora substituem o diretório para não manter resultados anteriores visíveis durante uma nova consulta. O estado vazio após busca bem-sucedida também continua usando a mensagem de disponibilidade apropriada. Com intervalo de preço ativo em uma busca com datas, a comparação usa somente a diária da cotação positiva; anúncio sem cotação fica fora desse intervalo e segue visível quando nenhum filtro de preço foi selecionado. Isso evita filtrar com uma tarifa de referência como se fosse a cotação da estadia.

Validação: testes direcionados de busca/roteador/filtros passaram 9/9; `tests/Feature/AccommodationApiTest.php` passou 10/10; `npm run lint`, Pint, Prettier nos arquivos alterados e `git diff --check` passaram. Os testes são locais e isolados; não houve sandbox, servidor, browser visual, reserva ou pagamento. A inspeção visual manual segue pendente. Nenhum contrato Laravel/Stays, commit, push, merge ou deploy foi alterado nesta etapa.

### Continuação da auditoria — filtros no diretório de condomínios (2026-10-17)

A barra permitia abrir filtros na categoria “Condomínios”, mas o diretório era construído a partir do catálogo bruto e não mostrava os chips ativos. Isso fazia o diretório ignorar filtros de comodidades, preço e capacidade, além de esconder ações para removê-los. A categoria agora corresponde a anúncios associados a um condomínio; o diretório é agrupado a partir dos anúncios filtrados, e os chips ativos/removíveis aparecem também nessa visualização. O caminho de lista e mapa continua recebendo a mesma coleção filtrada, e a sincronização já coberta mantém rota, hash e parâmetros externos da URL.

Validação: 26 testes direcionados passaram, incluindo categorização, view model do catálogo, filtros removíveis no diretório, sincronização de URL e preço nos marcadores do mapa; `npm run lint`, `npm run build`, Prettier nos arquivos com formatação atual e `git diff --check` passaram. Nenhum servidor ou sandbox foi iniciado. Inspeção visual manual, validação em viewport estreito e leitor de tela permanecem pendentes.

### Continuação da auditoria — estado do detalhe na URL (2026-10-17)

A página de detalhe agora atualiza a query string ao alterar datas ou composição de hóspedes, usando `replaceState` para manter a URL compartilhável e preservar rota, hash e parâmetros externos. Datas sugeridas pelo calendário padrão não entram na URL até haver seleção explícita; assim, abrir um anúncio sem datas não cria uma busca datada artificial. O estado inicial também respeita um adulto quando esse é o valor recebido, em vez de substituir silenciosamente por dois.

Validação: os testes de detalhe e roteamento passaram 22/22, incluindo atualização da URL antes de copiar, compartilhamento de datas/hóspedes, preservação de parâmetros, deep link, retorno à lista/posição e um adulto sem datas explícitas. `npm run lint`, `npm run build`, Prettier no teste alterado e `git diff --check` passaram. Sem sandbox, servidor, inspeção visual, reserva ou pagamento; o browser visual continua pendente.

### Continuação da auditoria — guarda de cotação e imagem principal (2026-10-17)

A condição visual do CTA de reserva agora exige a mesma evidência que a ação final: intervalo confirmado, cotação marcada como sucesso, fonte Stays ao vivo, total finito e positivo, e ausência de recálculo em andamento. Isso impede que uma resposta inconsistente com `success=false` apresente “Continuar para reserva” habilitado, embora o handler já recusasse o avanço. A foto principal do detalhe recebe prioridade alta e carregamento eager por estar no primeiro viewport; as demais fotos permanecem sem prioridade elevada.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 15/15, incluindo a resposta Stays `success=false`; `npm run lint`, `npm run build` e `git diff --check` passaram. O teste ainda emite avisos de fetch para URLs relativas em casos sem mocks, sem falhas. Nenhum servidor, sandbox, reserva, pagamento ou publicação foi acionado. A inspeção visual e o leitor de tela continuam pendentes.

### Continuação da auditoria — feedback do seletor de datas (2026-10-17)

Mensagens de seleção inválida eram enviadas somente ao calendário da página sob o diálogo de datas. O seletor agora recebe e anuncia a mensagem no próprio modal com `role=status`/`aria-live=polite`; o nome do mês também é anunciado após navegação entre meses. Os rótulos dos dias da semana mudaram de `neutral-400` para `neutral-600` para melhorar legibilidade do texto pequeno.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 16/16, incluindo a presença e semântica da mensagem dentro do diálogo; `npm run lint`, `npm run build`, Prettier no teste alterado e `git diff --check` passaram. A checagem Prettier global dos componentes continua apontando diferenças legadas, que não foram reformatadas em massa. Sem servidor, sandbox, reserva, pagamento ou publicação; inspeção visual e leitor de tela seguem pendentes.

### Continuação da auditoria — anúncios do seletor de hóspedes (2026-10-17)

Os valores de adultos, crianças e bebês mantêm região viva e agora fornecem um nome acessível contextual, por exemplo “Adultos: 3”, para que mudanças não sejam anunciadas apenas como um número sem categoria.

Validação: teste de interação do seletor de hóspedes passou 1/1; `npm run lint`, `npm run build`, Prettier no teste e `git diff --check` passaram. Nenhuma inspeção de browser, servidor, sandbox, reserva ou pagamento foi iniciada.

### Continuação da auditoria — navegação de datas por teclado (2026-10-17)

O calendário de datas aceita setas esquerda/direita para navegar por dia e cima/baixo para navegar por semana. A navegação pula dias que não são selecionáveis para o campo atual e move o foco junto ao mês quando necessário; o texto de ajuda informa o suporte ao teclado. O foco não altera datas nem inicia uma reserva sem ativação explícita.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 16/16, incluindo navegação diária, semanal e salto sobre data indisponível; lint/TypeScript, build, Prettier no teste e `git diff --check` passaram. Os casos de teste sem mocks ainda registram avisos esperados de URLs relativas `/api/*`. Inspeção visual real, viewport 320/375 e leitor de tela permanecem pendentes.

### Continuação da auditoria — retentativa de cotação (2026-10-17)

Quando o calendário confirma o intervalo e a cotação ao vivo falha ou não retorna preço positivo, a interface agora diferencia “Cotação indisponível” de “Disponibilidade indisponível” e oferece “Tentar cotação novamente”. O hook repete apenas o cálculo de preço para as mesmas datas/hóspedes; o CTA permanece bloqueado até chegar uma cotação Stays válida. O status de preço também é uma região viva para anunciar carregamento/resultado.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 17/17, incluindo falha inicial, retentativa e habilitação do CTA somente após cotação válida; lint/TypeScript, build, Prettier no teste e `git diff --check` passaram. Avisos de fetch com URLs relativas ocorrem nos casos sem mocks já existentes. Nenhuma reserva, pagamento, chamada real, servidor ou sandbox foi iniciado.

### Continuação da auditoria — foco ao remover filtros (2026-10-17)

Ao remover um chip ativo, o foco de teclado agora segue para o próximo chip na mesma posição; ao remover o último, volta ao botão de abrir filtros. Isso mantém a sequência de remoção operável sem mouse e evita que o foco caia no documento após o item focado sair do DOM.

Validação: `tests/activeSearchFilters.test.ts` passou 5/5, incluindo remoção consecutiva e retorno ao acionador; `npm run lint`, `npm run build`, Prettier no teste e `git diff --check` passaram. Nenhuma verificação de browser, servidor, sandbox, reserva ou pagamento ocorreu nesta etapa.

### Continuação da auditoria — controles do carrossel nos cartões (2026-10-17)

Os botões de miniaturas agora expõem `aria-pressed` para indicar a foto ativa e todos os controles do carrossel/favorito têm contorno de foco explícito. A troca da miniatura atualiza o estado acessível junto com o conteúdo visual; tarifa de referência e comodidades existentes já tinham cobertura e permaneceram intactas.

Validação: `tests/propertyCatalogGrid.test.ts` passou 8/8, inclusive estado da foto selecionada e classes de foco; `npm run lint`, `npm run build`, Prettier no teste e `git diff --check` passaram. Não foi feita inspeção visual no browser.

### Continuação da auditoria — foco visível na barra de descoberta (2026-10-17)

Os controles de categoria, paginação de categorias, filtros, alternância de mapa/lista e switch de total com taxas agora têm indicadores de foco explícitos. O switch não depende mais do outline removido por `focus:outline-none`; o foco usa um contorno com contraste adequado ao fundo de cada controle.

Validação: testes de categoria e cartões passaram 12/12; `npm run lint`, `npm run build`, Prettier no teste alterado e `git diff --check` passaram. Inspeção visual de browser e contraste calculado em telas renderizadas seguem pendentes.

### Continuação da auditoria — estimativas de preço sem cotação válida (2026-10-17)

A validação de cotação passou a ser compartilhada entre cálculo e apresentação do resumo. Respostas não bem-sucedidas, sem fonte Stays ao vivo, total/diária não positivos ou noites inválidas não alimentam taxas e total como se fossem cotação. Sem cotação válida, uma estimativa só é apresentada se o anúncio tiver tarifa de referência conhecida; sem tarifa e sem cotação, o resumo não exibe um total zero fictício. Taxas estimadas são identificadas como estimadas.

Validação: testes de preço e detalhe passaram 22/22, incluindo resposta falha com fallback para tarifa conhecida e ausência de total zero quando não há preço; `npm run lint`, `npm run build`, Prettier nos testes alterados e `git diff --check` passaram. Nenhum dado real, reserva, pagamento, servidor, sandbox ou publicação foi utilizado.

### Continuação da auditoria — navegação por teclado no calendário (2026-10-17)

O calendário de reserva agora expõe a estrutura acessível de grade com cabeçalhos de dias e semanas. Somente um dia disponível entra na sequência de Tab; setas movem o foco e atualizam a parada móvel, pulando datas bloqueadas. A parada de Tab inicial usa a data ativa quando ela está disponível no mês, ou o primeiro dia selecionável. Células vazias de alinhamento visual ficam ocultas para tecnologia assistiva. A aparência dos dias bloqueados, a confirmação de disponibilidade e as regras de seleção permanecem iguais.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 18/18, cobrindo grade nomeada, sete cabeçalhos, parada única de Tab, movimentação do ponto de tabulação com setas e datas bloqueadas. `npm run build` e ESLint do componente passaram; Prettier e `git diff --check` passaram no diff final. A suíte imprime avisos de fetch relativo `/api/*` em casos existentes sem mocks; não houve falhas. Sem sandbox, servidor, reserva, pagamento ou publicação. Validação por leitor de tela e inspeção visual seguem pendentes.

### Continuação da auditoria — retorno ao catálogo sem deslocar a rolagem (2026-10-17)

Ao voltar do detalhe, o App devolvia o foco ao landmark principal. O foco nativo pode deslocar a viewport e competir com a rolagem de catálogo restaurada pelo roteador. O retorno agora move foco com `preventScroll`, preservando a posição salva e mantendo a navegação por teclado.

Validação: `tests/accommodationRouting.test.ts` e `tests/focus.test.ts` passaram 9/9; o teste do utilitário confirma `preventScroll`. `npm run lint`, `npm run build`, Prettier nos arquivos alterados e `git diff --check` passaram. Nenhuma rota, query string, reserva, pagamento ou contrato de API mudou. Browser visual permanece desligado conforme o estado atual da porta local; leitor de tela segue pendente.

### Continuação da auditoria — calendário da busca por teclado (2026-10-17)

O calendário compartilhado da busca agora apresenta grade acessível, sete cabeçalhos de dias e uma única data disponível na sequência de Tab. As setas navegam dia/semana, pulam datas anteriores ao mínimo e atravessam meses mantendo o foco; a seleção e os limites de datas continuam os mesmos. Em telas baixas, o popover limita sua altura à viewport e permite rolagem interna. Este calendário é genérico e não marca indisponibilidade de um imóvel específico antes da busca: os resultados continuam vindo da consulta de disponibilidade e o detalhe confirma o calendário do anúncio.

Validação: `tests/staysSearchWidgetAccessibility.test.ts` passou 9/9, cobrindo foco móvel, navegação diária e semanal, mudança de mês, Escape, retorno ao acionador e altura de viewport estreita. `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Sem sandbox, servidor, inspeção visual, reserva ou pagamento; os testes não fazem chamadas de disponibilidade por imóvel.

### Continuação da auditoria — contexto de disponibilidade e cotação (2026-10-17)

O estado de calendário e cotação agora é associado ao imóvel/intervalo consultado; a cotação também inclui a quantidade de hóspedes. Ao mudar hóspedes ou imóvel, uma resposta anterior é imediatamente ocultada e o CTA permanece bloqueado até a nova cotação válida. O calendário também volta ao estado de confirmação pendente ao trocar de imóvel ou check-in. Respostas que chegam depois do descarte do efeito continuam ignoradas.

Validação: `tests/propertyAvailabilityHook.test.ts` passou 3/3, incluindo troca de hóspedes e de imóvel com respostas concorrentes; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Sem alteração de contratos da API ou critérios de disponibilidade. Nenhuma requisição real, reserva, pagamento, servidor ou sandbox foi iniciado.

### Continuação da auditoria — preço anunciado ao focar cartões (2026-10-17)

O controle principal de cada cartão agora associa o preço visível como descrição acessível. Ao navegar por teclado ou leitor de tela, a pessoa recebe o título do imóvel e o contexto de preço (cotação por noite/total, tarifa de referência, preço pendente ou indisponível) ao focar “Ver detalhes”. Lista e mapa continuam usando o mesmo resolvedor de preço.

Validação: testes de cartão, resolvedor e mapa passaram 15/15, incluindo preço pendente e total com taxas associado ao botão do imóvel. `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram; nenhuma API ou dado foi alterado.

### Continuação da auditoria — preservar rascunhos do formulário de busca (2026-10-17)

O formulário de busca antes copiava novamente todos os filtros aplicados sempre que qualquer filtro mudava. Uma mudança independente de categoria podia apagar datas editadas mas ainda não enviadas. Agora os campos locais só ressincronizam quando mudam datas, hóspedes ou destino; mudanças de categoria/facetas mantêm o rascunho, enquanto remover datas/destino externamente continua sincronizando esses campos.

Validação: `tests/staysSearchWidgetAccessibility.test.ts` passou 10/10, inclusive uma data editada mantida após mudança de categoria. `npm run lint`, `npm run build`, Prettier nos dois arquivos alterados e `git diff --check` passaram. A sincronização do formulário depende dos valores relevantes de data, hóspedes e destino, sem reagir a mudanças de identidade do objeto de hóspedes causadas por filtros independentes. Sem alteração na busca/API ou disponibilidade; não houve sandbox, servidor, reserva, pagamento ou publicação.

### Continuação da auditoria — comodidades consistentes no mapa (2026-10-17)

O cartão de imóvel aberto a partir de um marcador agora resume até três comodidades registradas, com indicação “mais N” quando há outras. O cartão da lista usa o mesmo resolvedor: ambos removem espaços vazios e duplicatas e não inventam características ausentes. Preço e CTA do popup continuam a usar o resolvedor de cotação compartilhado.

Validação: testes de cartão e mapa passaram 12/12, cobrindo deduplicação, limite/contagem e comodidades apresentadas no popup. `npm run lint`, `npm run build`, Prettier nos arquivos alterados e `git diff --check` passaram. A inspeção visual no browser segue pendente; nenhum servidor, sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação da auditoria — retorno localizado do detalhe (2026-10-17)

Ao abrir uma acomodação a partir de `/pt/search`, a rota do detalhe agora mantém o prefixo `/pt` (`/pt/apartment/{id}`). Ao fechar um deep link localizado sem entrada de catálogo no histórico, o retorno vai a `/pt/search`, preservando query, hash e filtros compartilhados. Rotas sem prefixo mantêm os caminhos atuais.

Validação: `tests/accommodationRouting.test.ts` passou 8/8, incluindo deep link localizado e preservação de query/hash. `npm run lint`, `npm run build` e Prettier nos arquivos alterados passaram. Não houve sandbox, servidor, reserva, pagamento ou publicação; verificação visual de navegação permanece pendente.

### Continuação da auditoria — anúncio de busca sem disponibilidade (2026-10-17)

Quando a busca concluía sem resultados, a mensagem de disponibilidade vazia não era anunciada como mudança de estado para leitores de tela. O resultado vazio agora usa `role="status"` e `aria-live="polite"`. A cobertura também diferencia falta de disponibilidade de resultados removidos apenas pelos filtros ativos e confirma que o botão de nova tentativa aciona a consulta registrada.

Validação: `tests/availabilitySearchState.test.ts`, `tests/mainContentRouter.test.ts` e `tests/accommodationSearchHook.test.ts` passaram 21/21; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Os testes de componente com JSDOM imprimiram avisos preexistentes por `/api/resorts` relativo sem servidor; não houve chamadas reais de disponibilidade, servidor, sandbox, reserva ou pagamento.

### Continuação da auditoria — foco de teclado nos controles do mapa (2026-10-17)

O contêiner do mapa, zoom, enquadramento, abertura do OpenStreetMap e fechamento do resumo selecionado agora mostram um contorno de foco explícito para teclado. A lista e o detalhe do imóvel mantêm o mesmo conteúdo e comportamento.

Validação: `tests/interactiveMapPricing.test.ts` passou 4/4, incluindo foco visível nos controles. `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Não foi possível inspecionar visualmente o resultado: a porta local 3000 não tinha servidor ativo e o CUA reportou o Mac bloqueado. Não iniciei servidor nem sandbox.

### Continuação da auditoria — teclado do mapa sem interceptar marcadores (2026-10-17)

As setas agora movem o mapa somente quando o próprio canvas está focado; ao focar um marcador, as teclas não deslocam o mapa por propagação do evento. O mapa expõe uma instrução acessível associada ao canvas: setas para mover e Tab para acessar imóveis/controles.

Validação: `tests/interactiveMapPricing.test.ts` passou 5/5, comprovando que ArrowRight altera a posição do marcador apenas quando o canvas tem o evento de teclado. `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Sem inspeção visual, servidor ou sandbox.

### Continuação da auditoria — filtros ativos para datas e hóspedes (2026-10-17)

O grupo de filtros ativos agora representa também o intervalo de datas e a composição não padrão de hóspedes, com ações de remoção e limpeza mesmo quando esses são os únicos parâmetros escolhidos. Remover datas refaz a consulta sem período e limpa cotação antiga; remover hóspedes volta à composição padrão e, se houver datas, refaz a confirmação de disponibilidade. A sincronização já existente reflete as alterações na URL.

Validação: testes de chips, roteamento de conteúdo e serialização/sincronização de URL passaram 19/19; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Os testes JSDOM do roteador emitiram avisos conhecidos por `/api/resorts` relativo sem servidor, sem falhas. Não houve servidor, sandbox, chamada real, reserva ou pagamento.

Checagem visual posterior em Chromium local a 1200 CSS px: o grupo exibiu chips de datas e composição de hóspedes em linhas sem sobreposição. Remover datas retirou `from`/`to` da URL e manteve hóspedes; remover hóspedes voltou a omitir a composição padrão da query. O catálogo mostrou estado vazio/erro conforme o backend Laravel estava indisponível em 127.0.0.1:8000; isso não valida resultados reais. O Vite temporário foi encerrado após a checagem; não foi iniciada reserva ou pagamento.

### Continuação da auditoria — cabeçalho do detalhe em telas estreitas (2026-10-17)

O cabeçalho do detalhe agora reduz os recuos em mobile, limita o botão de compartilhar e mantém espaçamento entre voltar, compartilhar e salvar. O contorno de foco do botão voltar foi reduzido para um deslocamento de 1 px, sem remover a indicação para teclado.

Validação: `npm run build` e `git diff --check` passaram. Chromium local confirmou que, em 320 px e 375 px, as ações cabem na barra com 12 px de margem interna; o foco permanece visível com deslocamento de 1 px. A página inteira também ficou sem overflow horizontal em 320 px. O diálogo de datas coube na viewport e, com o backend Laravel indisponível, mostrou erro explícito, datas bloqueadas e ação de nova tentativa; isso confirma o fallback visual, não a disponibilidade real do imóvel. Nenhuma reserva, pagamento ou publicação foi realizada.

### Continuação da auditoria — seleção de intervalo por toque no calendário (2026-10-17)

No calendário do detalhe, um toque e arrasto a partir do check-in agora mostra a prévia do intervalo; ao soltar, seleciona check-in e check-out em um único gesto. A seleção só é aplicada quando a chegada está aberta e todas as noites respeitam disponibilidade e estadia mínima; intervalos inválidos preservam as datas existentes e anunciam o motivo. Toques simples e navegação por teclado continuam disponíveis. A instrução aparece somente quando o campo ativo é check-in.

Validação: testes direcionados de seleção de datas e detalhe passaram 23/23; `npm run lint`, `npm run build`, Prettier nos arquivos alterados e `git diff --check` passaram. Chromium local a 320 px confirmou a prévia visual e a seleção de 20–23 e depois 24–27/10 usando calendário simulado somente na aba; o backend Laravel estava indisponível. O Vite temporário foi encerrado. Nenhuma chamada Stays real, reserva, pagamento ou publicação foi realizada.

### Continuação da auditoria — cobertura progressiva do calendário (2026-10-17)

Ao avançar além da janela inicial de 90 dias, o detalhe agora consulta os próximos intervalos pelo endpoint de calendário já existente. As datas sem confirmação permanecem sem seleção e não são apresentadas como indisponibilidade confirmada; erros de extensão mostram carregamento e permitem nova tentativa. A consulta avança em blocos, sem mudança no contrato Laravel/Stays.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não foram executados testes de sandbox nem inspeção visual nesta etapa; a checagem manual do calendário com meses além da janela inicial continua pendente. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — contexto e falha da busca com datas (2026-10-17)

O adaptador de busca agora propaga falhas quando datas foram informadas, em vez de convertê-las em uma lista vazia que aparentava ausência de disponibilidade. Além da origem `stays-live`, a resposta precisa corresponder ao check-in, check-out e número de hóspedes solicitados; respostas de outro contexto são rejeitadas para evitar exibir disponibilidade ou preço cotado para uma pesquisa diferente. Cotações individuais cujo número de noites não corresponde ao intervalo também são removidas, deixando o preço pendente sem esconder o imóvel confirmado como disponível. O hook existente apresenta o estado de erro e a ação de nova tentativa; a busca sem datas conserva o fallback local.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Testes e sandbox não foram executados conforme a orientação vigente; o comportamento de erro/retry e a correspondência de contexto ainda precisam de validação manual. Nenhuma rota ou resposta do backend foi alterada, e nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — deduplicação de comodidades nos cartões (2026-10-17)

O resumo compartilhado por lista e mapa agora identifica duplicatas ignorando diferenças de caixa, acentos e pontuação, mas mantém a primeira descrição original para exibição. Isso evita contar a mesma comodidade duas vezes quando as fontes do anúncio e do condomínio usam grafias distintas.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Testes e inspeção visual não foram executados conforme a orientação vigente; a revisão manual das variações do catálogo permanece pendente. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — sincronização de rota do detalhe (2026-10-17)

O carregamento de um imóvel por link direto agora só atualiza a tela se a rota ainda apontar para aquele imóvel quando a resposta chegar. A navegação do navegador para uma rota de detalhe também busca o imóvel quando ele não está no catálogo carregado. Isso evita que uma resposta atrasada reabra um detalhe depois de o visitante voltar à busca.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. A regressão foi coberta no arquivo de testes, mas os testes não foram executados conforme a orientação vigente; não houve inspeção visual nem uso do sandbox. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — separar viagem de filtros do imóvel (2026-10-17)

Os chips de destino, datas e hóspedes agora aparecem no grupo “Sua viagem”; preço, tipo, comodidades e características do imóvel ficam em “Filtros do imóvel”. “Limpar filtros” só aparece quando há refinamentos do imóvel e limpa apenas esses refinamentos, mantendo a viagem e o modo de categoria. Assim o botão não aparece como ação sem efeito quando apenas datas/hóspedes estão ativos. A URL continua sincronizada pelo mesmo estado e lista/mapa continuam usando os mesmos filtros derivados. O foco após limpar é movido para um critério restante ou para o acionador de filtros.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Os testes de interface foram atualizados, mas não executados; inspeção visual não realizada conforme a orientação vigente. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — foco ao abrir detalhe (2026-10-17)

Na página do imóvel, o foco programático agora vai para o título em vez do botão “Voltar para resultados”, removendo o aro de foco laranja que aparecia no controle ao abrir a rota. No modo diálogo, o título também recebe o foco inicial; a sequência de Tab continua começando pelos controles interativos. O foco de retorno ao elemento que abriu o diálogo segue gerenciado pelo hook compartilhado.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. As asserções de foco foram adicionadas ao teste de acessibilidade, mas nenhum teste ou inspeção visual foi executado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — affordance de localização (2026-10-17)

A localização resumida no cabeçalho deixou de parecer clicável porque não tinha ação associada. O link funcional para o Google Maps agora nomeia o imóvel e informa que será aberta uma nova aba, para que a ação externa fique clara também com leitor de tela.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não houve execução de testes ou inspeção visual. Nenhuma API, reserva, pagamento ou publicação foi alterada.

### Continuação da auditoria — mapa sem marcadores visíveis (2026-10-17)

Quando os resultados não têm coordenadas utilizáveis, o mapa agora explica que os imóveis seguem acessíveis na lista. Quando há coordenadas, mas os imóveis ficaram fora da área após mover o mapa, a tela explica o estado e oferece “Mostrar todos no mapa”, reenquadrando os resultados. A mensagem só aparece depois da medição inicial do mapa para evitar um estado vazio transitório.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Um teste cobrindo anúncios sem coordenadas foi adicionado, mas não executado conforme a orientação de não usar testes de sandbox; não houve inspeção visual. Nenhuma API, reserva, pagamento ou publicação foi alterada.

### Continuação da auditoria — busca surpresa com falhas parciais (2026-10-17)

Na busca “Surpreenda-me”, uma única consulta bem-sucedida sem preço confirmado podia fazer a UI declarar que não havia resultados, mesmo que as demais datas tivessem falhado. O estado vazio agora só é considerado conclusivo quando todas as datas candidatas foram consultadas; falhas parciais sem cotação mantêm o estado de erro e a opção de tentar novamente. Um teste de regressão foi adicionado sem execução.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Testes e inspeção visual não foram realizados conforme a orientação vigente. A busca continua usando o contrato existente e não inicia reserva ou pagamento.

### Continuação da auditoria — transparência de conversão monetária (2026-10-17)

Os valores exibidos em USD/EUR usam fatores de conversão locais e fixos; agora aparecem com o indicador `≈` para não parecerem uma cotação exata. O seletor de moeda informa que a conversão é aproximada, e o checkout esclarece junto ao total que o pagamento é processado em BRL. A moeda e os valores enviados ao backend não foram alterados.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Foi adicionada uma asserção de formatação, mas nenhum teste ou inspeção visual foi executado; não houve pagamento real.

### Continuação da auditoria — navegação no topo do checkout (2026-10-17)

O cabeçalho do checkout exibia “Voltar e fechar checkout” e “Fechar checkout”, dois controles com a mesma ação. Mantive apenas “Voltar para acomodação” e direcionei o foco inicial ao título do diálogo; o gerenciamento de foco e seu retorno ao acionador continuam no hook compartilhado.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não há teste específico de renderização deste cabeçalho e nenhum teste ou inspeção visual foi executado. Nenhum pedido, reserva ou pagamento foi criado.

### Continuação da auditoria — alternativa de pagamento compatível (2026-10-17)

O aviso do formulário de cartão agora só sugere Pix quando Pix está realmente habilitado para aquele pedido. Quando não está, a mensagem orienta a tentar outro cartão compatível, sem anunciar uma alternativa inexistente. A disponibilidade vem do estado de pagamento já validado no pedido; nenhum contrato foi alterado.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não há teste específico desta mensagem condicional; nenhum teste, pagamento ou inspeção visual foi executado.

### Continuação da auditoria — retentativa de prontidão do checkout (2026-10-17)

Falhas ao carregar condições ou prontidão agora deixam uma ação “Tentar novamente” no checkout. Durante a nova consulta, o controle permanece no DOM e anuncia o estado; ao terminar, o foco vai para a mensagem atualizada para evitar que desapareça para teclado/leitor de tela. Respostas válidas que indicam configuração desabilitada agora explicam separadamente se a compra, os termos ou o pagamento ainda não estão habilitados. O CTA segue bloqueado até termos, preço e forma de pagamento estarem prontos.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não há teste específico desta interação e nenhum teste ou inspeção visual foi executado. Nenhum pedido, reserva ou pagamento foi iniciado.

### Continuação da auditoria — corrida ao estender o calendário (2026-10-17)

Extensões do calendário agora são identificadas pelo imóvel/contexto. Uma consulta antiga deixa de bloquear a extensão do imóvel aberto em seguida, e pedidos para avançar mais meses durante uma consulta atual atualizam o destino até o último mês solicitado. A retentativa também só reutiliza o destino associado ao contexto atual; o endpoint e o contrato permanecem iguais.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Nenhum teste ou sandbox foi executado e não houve inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — limite da faixa de preço nos filtros (2026-10-17)

O campo de preço máximo aceitava R$ 15.000, enquanto o estado de busca e a URL limitam o filtro a R$ 5.000. O campo agora respeita o mesmo teto e mantém mínimo/máximo dentro desse intervalo; o texto explicita que o critério é definido em reais antes de taxas.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Nenhum teste ou inspeção visual foi executado. Nenhuma API, reserva, pagamento ou publicação foi alterada.

### Continuação da auditoria — moeda da cotação Stays nos cartões (2026-10-17)

O endpoint Laravel selecionava valores `_mctotal.BRL`, mas marcava a cotação com `mainCurrency` do anúncio. Agora o payload identifica os valores BRL como BRL. A diária usa `_mcsubtotal.BRL` quando Stays fornece esse subtotal; se ele não vier, a diária do anúncio só é aceita quando a moeda principal é BRL. Sem diária BRL confiável, o imóvel continua no resultado, mas não recebe cotação exibível. Isso mantém a UI e os filtros de preço alinhados sem mudar o contrato da resposta. A referência da Stays mostra totais indexados por moeda e `mainCurrency` no objeto de cotação: https://stays.net/external-api/.

Validação: lint PHP, Pint direcionado, build frontend, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes ou sandbox nem fiz inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — estados da rota compartilhável do imóvel (2026-10-17)

Links de detalhe agora mostram um estado de carregamento enquanto o imóvel é resolvido fora do catálogo atual. Se não houver acomodação para renderizar, a página apresenta uma mensagem neutra de falha ao abrir, com ações para tentar novamente ou voltar à busca, em vez de mostrar o catálogo sob a URL do imóvel. A mensagem não atribui a falha a imóvel removido porque o adaptador pode converter falha de rede em fallback local. A rota e os parâmetros existentes são preservados.

Validação: build, ESLint direcionado, Prettier nos arquivos alterados e `git diff --check` passaram. Nenhum teste ou sandbox foi executado e não houve inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — contagem de hóspedes entre busca e checkout (2026-10-17)

A busca datada e o filtro local contavam adultos e crianças, enquanto a cotação do detalhe e o checkout também contavam bebês. Agora a capacidade usa a mesma contagem nos filtros, busca, cotação e checkout: adultos + crianças + bebês; pets permanecem fora da ocupação, como no backend. Os seletores que não editam bebês mostram essa informação junto ao número de pessoas preservado.

Validação: build, ESLint direcionado, Prettier nos arquivos novos/alterados e `git diff --check` passaram. Nenhum teste ou sandbox foi executado nem houve inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — preço após seleção explícita de datas (2026-10-17)

No detalhe, quando as datas eram informadas pelo link ou escolhidas no calendário, a tarifa de referência e uma estimativa calculada a partir dela ainda apareciam enquanto a cotação ao vivo não estava confirmada. O painel agora mostra preço em consulta, não confirmado ou indisponível conforme o estado; oculta o detalhamento estimado para datas explícitas e mantém a referência somente antes dessa seleção. A reserva continua condicionada à cotação Stays confirmada.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — remoção da categoria ativa (2026-10-17)

A categoria selecionada já filtrava os mesmos imóveis na lista e no mapa e era preservada na URL, mas não aparecia no resumo de critérios ativos. Agora o resumo mostra a categoria pelo rótulo legível e permite removê-la diretamente, voltando a “Todos os espaços”; a seleção visual da barra de categorias continua sincronizada pelo mesmo estado.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual. Nenhuma busca externa, reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — confirmação de disponibilidade nos cartões (2026-10-17)

Resultados de uma busca datada que retornaram com sucesso agora exibem “Disponível para as datas selecionadas” tanto no cartão da lista quanto no resumo do imóvel aberto no mapa. O selo depende do estado de sucesso da busca com datas; fica oculto no catálogo geral e durante loading/erro, evitando inferir disponibilidade a partir de uma tarifa ou de dados antigos. A descrição acessível do botão principal do cartão inclui essa confirmação.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor local está parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — busca datada no primeiro render (2026-10-17)

Ao abrir a home com intervalo válido na URL, o estado de disponibilidade começava como `idle` e só mudava para `loading` no efeito seguinte. Isso permitia um render transitório do catálogo geral — inclusive do diretório de condomínios — antes da confirmação do período. O estado inicial agora reconhece as datas da URL e começa em carregamento, mantendo o catálogo geral visível apenas quando não há período solicitado.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor local continua parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — alvos de toque do mapa (2026-10-17)

Os controles principais do mapa — zoom, enquadramento, abrir mapa externo, fechar o resumo e “Ver detalhes” — agora oferecem área mínima próxima de 44 px e foco visível. O botão “Mostrar todos no mapa” segue a mesma altura mínima. Os marcadores de preço continuam compactos para preservar a leitura quando há imóveis próximos.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — proporção das fotos dos cartões em mobile (2026-10-17)

As imagens quadradas dos cartões ocupavam cerca de uma largura completa de altura no catálogo mobile, empurrando preço e disponibilidade para baixo e reduzindo a quantidade de imóveis comparáveis por viewport. A área da foto agora usa proporção 4:3 com o mesmo recorte preenchido.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. O ganho efetivo de conteúdo visível ainda precisa de conferência em viewport real. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — acesso antecipado à reserva no detalhe mobile (2026-10-17)

No mobile, o painel de datas, hóspedes e cotação ficava depois da descrição, comodidades, disponibilidade, localização e anfitrião. Ele agora aparece logo após as fotos, reduzindo o caminho até consultar o período e a cotação. No desktop, continua na coluna direita; a ordem do DOM também segue a nova ordem mobile para manter leitura e foco coerentes.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — carrossel dos cartões em telas touch (2026-10-17)

As setas de fotos do cartão agora ficam visíveis em telas touch, onde não há hover, e aparecem por hover/foco em telas maiores. Favoritar e avançar/voltar fotos têm alvos mínimos de 44 px; os indicadores de foto mantêm tamanho compacto, mas continuam com 24 px ou mais.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — ação para corrigir busca sem disponibilidade (2026-10-17)

Os estados de busca datada sem resultados e de falha agora podem abrir diretamente o modal de busca, permitindo ajustar datas e hóspedes sem voltar ao topo da página. A consulta continua com a ação de retentativa; resultados disponíveis ocultados apenas por filtros locais continuam orientando a remoção desses filtros.

Validação: `npm run build`, ESLint nos três componentes envolvidos, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — mesma cotação para cartão e filtro de preço (2026-10-17)

O cartão e o mapa já exigiam uma cotação positiva e bem formada, mas o filtro de preço só verificava se total e diária eram maiores que zero, sem conferir moeda BRL nem valores finitos/noites. Agora ambos usam a mesma validação de cotação. Em busca com datas, anúncios sem cotação BRL válida não entram em um intervalo de preço como se a tarifa fosse confiável; continuam visíveis sem esse refinamento.

Validação: `npm run build`, ESLint nos utilitários de preço/filtros, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — moeda da faixa de preço nos filtros ativos (2026-10-17)

O modal informa que o intervalo de preço é definido em reais por noite, e a URL armazena esses mesmos limites BRL. O chip ativo agora também mantém valores em BRL, mesmo quando os preços dos cartões estão em USD ou EUR aproximados, para o critério aplicado permanecer claro e coerente entre busca, lista, mapa e link compartilhado.

Validação: `npm run build`, ESLint nos componentes de filtros ativos e roteador, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — alvos de toque na busca e reserva mobile (2026-10-17)

Os controles principais para avançar categorias, abrir filtros/mapa, alterar hóspedes e navegar meses tinham alvos de 32–36 px. Eles agora têm pelo menos 44×44 px, os botões de remover critérios têm 24×24 px e a barra de categorias reserva espaço para as setas maiores, mantendo cartões completos em telas estreitas.

Validação: `npm run build`, ESLint nos sete componentes de busca/reserva e `git diff --check` passaram; Prettier passou nos demais arquivos tocados. `CategoryBar.tsx` já falha no Prettier também na versão do `HEAD`, então não reformattei o componente inteiro para evitar ruído fora do escopo. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — foco ao retornar à lista de imóveis (2026-10-17)

Ao abrir o detalhe como página, o conteúdo da lista desmonta; ao voltar, a restauração de foco ia sempre para o elemento `<main>`, mesmo quando a navegação começou por um cartão ou pelo botão “Ver detalhes” no mapa. A origem agora registra o id do imóvel focado no estado da entrada de histórico e, ao retornar, o foco volta ao acionador desse imóvel. Se o resultado não estiver mais no DOM, o foco retorna à região principal do catálogo. A restauração da posição vertical existente permanece.

Validação: `npm run build`, ESLint nos quatro arquivos TypeScript envolvidos e `git diff --check` passaram; Prettier passou no hook de rota, nos acionadores e no plano. `App.tsx` já falha no Prettier também na versão do `HEAD`, então não reformattei o arquivo inteiro. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — preço diário e estado de confirmação do calendário (2026-10-17)

O resumo de disponibilidade classificava falha/consulta como “Indisponível” e preenchia preço diário ausente com a tarifa base do imóvel. Agora os estados ficam distintos (“Consultando”, “Sincronizado”, “Não confirmado”); cada dia mostra cotação apenas quando o calendário fornece um valor BRL positivo, ou “Consultar”/“preço não confirmado”. As regras de bloqueio e seleção continuam baseadas na disponibilidade confirmada do calendário.

Validação: `npm run build`, ESLint nos componentes do calendário, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — retentativa da disponibilidade no resumo do calendário (2026-10-17)

Quando o pedido do calendário falhava, a faixa de 14 dias mostrava o erro, mas a única retentativa estava dentro do seletor de datas. O resumo agora oferece “Tentar novamente” ao lado da mensagem quando a disponibilidade não foi confirmada; em carregamento o CTA não aparece, e mensagens de seleção inválida com calendário confirmado não acionam retry.

Validação: `npm run build`, ESLint nos componentes do calendário, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — mínimo de uma noite na busca (2026-10-17)

O calendário genérico da busca permitia escolher checkout no mesmo dia do check-in, embora o envio recusasse a pesquisa depois. Agora a primeira data de checkout selecionável é o dia seguinte à entrada; o atalho “Hoje” fica desativado quando não atende ao mínimo. Ao alterar check-in e invalidar o checkout atual, o checkout padrão continua sendo dois dias depois.

Validação: `npm run build`, ESLint no componente de busca, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — mínimo de uma noite no modal de busca (2026-10-17)

O modal de busca aceitava datas anteriores a hoje e checkout no mesmo dia do check-in, apesar do seletor principal já exigir ao menos uma noite. Agora o check-in tem hoje como data mínima e a validação do envio também rejeita intervalos passados carregados anteriormente; o checkout começa no dia seguinte ao check-in, e um checkout já selecionado é ajustado para uma noite quando a nova entrada o invalida. As datas continuam opcionais.

Validação: `npm run build`, ESLint no modal, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — datas antigas em busca restaurada (2026-10-17)

O formulário principal limitava novas escolhas ao dia atual, mas um link ou histórico com check-in passado ainda podia ser enviado e iniciar consulta à API. O formulário agora informa o problema antes do envio, e a busca central valida formato, datas presentes, mínimo de uma noite e check-in a partir de hoje antes de chamar a API, inclusive nas restaurações pela URL.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — filtros de comodidades coerentes com o catálogo (2026-10-17)

O filtro expunha lareira, vista para o mar, pé na areia, café da manhã e política de pets sem correspondência nos campos de comodidades do catálogo de hospedagens em Caldas Novas; em contrapartida, omitia amenidades presentes como parque aquático, sauna, academia, varanda e hidromassagem. As opções agora priorizam as comodidades observadas no catálogo. O matching reconhece variações equivalentes (por exemplo, jacuzzi/hidro/banheira, cozinha/copa, estacionamento/garagem/vaga e varanda/sacada). Valores de comodidades já ativos em links ou filtros permanecem visíveis para que possam ser removidos.

Na amostra do catálogo estático local, as 11 opções atuais encontram ao menos dois imóveis cada; os números não representam validação do catálogo Stays ao vivo. Build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — alvos e nomes acessíveis no cabeçalho do detalhe (2026-10-17)

No cabeçalho fixo da página de imóvel, Voltar media 36×36 px e Compartilhar/Salvar ficavam abaixo do alvo recomendado de toque. Os três agora têm altura/largura mínimas de 44 px quando aplicável, foco visível com espaçamento e nomes acessíveis que identificam o imóvel. O estado `aria-pressed` de Salvar continua expondo se o imóvel está nos favoritos.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — cotação vinculada ao pedido (2026-10-17)

O cliente aceitava qualquer moeda e não comparava imóvel e número de noites da resposta com a solicitação de preço. O serviço agora descarta cotação que não corresponda ao imóvel solicitado, ao intervalo calculado ou à moeda BRL esperada pelo backend. A validação central de preço confirmado também exige BRL, e o painel e a ação de reserva compartilham essa regra. Uma resposta inconsistente fica sem cotação confirmada e não habilita a reserva.

Validação: `npm run build`, ESLint nos quatro arquivos TypeScript alterados, Prettier nos arquivos de código e no plano, e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — limite de espera das consultas (2026-10-17)

Busca, catálogo, calendário, cotação e resolução de link do imóvel podiam ficar em carregamento indefinidamente se a requisição não encerrasse. Essas operações agora abortam após 20 segundos. A busca datada chega ao estado de erro e oferece retry, o calendário permanece não confirmado com opção de tentar novamente, e preço não confirmado não libera a reserva. A carga do catálogo também pode concluir em erro e usar o retry existente.

Validação: `npm run build`, ESLint no serviço, Prettier no serviço e no plano, e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — contexto da busca nos estados vazios (2026-10-17)

As mensagens de loading, erro e ausência de resultados exibiam as datas sem ano e não informavam a quantidade de hóspedes usada na busca. Agora mostram o período completo e a ocupação (adultos, crianças e bebês) para o cliente confirmar o contexto, inclusive quando filtros locais escondem resultados que tinham disponibilidade confirmada.

Validação: `npm run build`, ESLint nos dois componentes alterados, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — hóspedes na confirmação dos resultados (2026-10-17)

O selo de disponibilidade na lista e no resumo do mapa mencionava apenas as datas, embora a pesquisa também confirme a ocupação. Agora os dois mostram datas selecionadas e número de hóspedes, e a descrição acessível de cada marcador inclui essa mesma confirmação. O número vem da contagem usada pelo filtro e pelo pedido de disponibilidade.

Validação: `npm run build`, ESLint nos quatro componentes alterados, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — dados atualizados no cartão do mapa (2026-10-17)

Quando um catálogo sincronizado atualizava dados de um imóvel já selecionado no mapa, os marcadores usavam o novo objeto, mas o cartão aberto podia manter preço e comodidades anteriores. O cartão agora acompanha a versão atual do mesmo imóvel e fecha se ele sair dos resultados válidos.

Validação: `npm run build`, ESLint no mapa, Prettier no mapa e no plano, e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — anúncio acessível dos resultados disponíveis (2026-10-17)

Ao concluir uma busca, cartões e marcadores apareciam visualmente, mas a mudança não anunciava a contagem para leitores de tela. Uma região `status` discreta agora informa o número de acomodações visíveis; em buscas datadas, inclui também período e hóspedes, e sem datas deixa explícito que a disponibilidade ainda depende do período.

Validação: `npm run build`, ESLint nos dois componentes, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — relação acessível entre marcador e resumo (2026-10-17)

Selecionar um marcador abria um cartão visual sem expor a relação com o botão que o controla nem um nome para navegação por regiões. O marcador selecionado agora informa o estado expandido e aponta para o resumo; o resumo passa a ser uma região nomeada pelo título do imóvel.

Validação: `npm run build`, ESLint no mapa, Prettier no mapa e no plano, e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — anúncio de resultados no diretório de condomínios (2026-10-17)

A busca bem-sucedida escondia a mensagem visual de estado porque a tela já mostrava cartões, deixando no DOM somente a região `status` que anuncia contagem e contexto. A rota do diretório de condomínios não montava esse componente quando havia resultados; agora o mesmo estado acompanha o diretório e anuncia as acomodações filtradas em buscas com datas.

Validação: `npm run build`, ESLint nos dois componentes, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — precisão do filtro de hidromassagem (2026-10-17)

O sinônimo `banheira` fazia um anúncio com banheira termal comum entrar no filtro “Hidromassagem”, e a busca por `hidro` podia corresponder ao termo “hidrotermais”. Removi a equivalência ampla com banheira e passei a exigir palavras completas, preservando variações simples de plural. “Banheira de hidromassagem” continua correspondendo pelo termo específico.

Validação: `npm run build`, ESLint no utilitário e consumidores, Prettier nos arquivos relacionados e no plano, e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — seleção do período por arraste na busca (2026-10-17)

O calendário do detalhe já permitia arrastar o toque do check-in até o check-out, mas a busca da home exigia abrir dois calendários separados. No calendário de entrada, agora é possível arrastar entre as datas; ao soltar, entrada e saída são preenchidas juntas, o intervalo fica destacado durante o gesto e o diálogo fecha. Toque simples, teclado e o calendário de saída permanecem disponíveis; o gesto só é habilitado no calendário de entrada.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. O gesto ainda precisa de confirmação manual em dispositivo com toque. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — ano explícito nos filtros de viagem (2026-10-17)

O chip de datas ativas mostrava apenas dia e mês, embora a URL aceite períodos futuros em anos diferentes. Agora o resumo exibe o ano em cada data, mantendo o período reconhecível também ao compartilhar ou revisar uma busca longa.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — taxas na cotação da busca (2026-10-17)

A rota Laravel de busca transformava `bookingPrice._mctotal.BRL` diretamente no preço total do cartão e descartava `feesIncluded`. O checkout próprio já distingue taxas incluídas das não incluídas. A busca agora exige esse indicador e dados de taxas coerentes antes de marcar o valor como cotação confirmada; quando as taxas não estão incluídas, soma as taxas BRL ao total. A diária continua derivada do subtotal ou da diária informada, descontando taxas incluídas quando necessário. A referência oficial da [API Stays](https://stays.net/external-api/) mostra `feesIncluded` e `fees` na resposta de busca e preço; a regra de soma segue a semântica já adotada pelo serviço de checkout local.

Validação: `php -l`, Pint no controlador, `npm run build` e `git diff --check` passaram. Não executei testes nem consulta autenticada Stays; o servidor permanece parado. A validação com payloads reais da conta e a revisão visual do cartão seguem pendentes. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — retorno de deep link ao catálogo (2026-10-17)

Ao fechar um imóvel aberto diretamente por URL, a rota do catálogo era adicionada ao histórico, então o botão Voltar do navegador reabria o mesmo imóvel. O retorno agora substitui a entrada do deep link pela rota do catálogo, preservando filtros, query e hash; quando o imóvel foi aberto pela busca, o fluxo existente continua voltando pela entrada anterior e restaurando posição e foco.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — confirmação de datas no detalhe (2026-10-17)

O detalhe usa uma faixa padrão para consultar calendário e preço, mas essa faixa podia habilitar a reserva, aparecer como cotação completa ou entrar no link compartilhado antes de qualquer confirmação da pessoa. A ação de reserva agora exige uma seleção explícita, o estado é redefinido ao trocar de imóvel, o painel mantém apenas a tarifa de referência até a confirmação e o link só inclui as datas depois dessa seleção.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — botão voltar do checkout em mobile (2026-10-17)

O botão “Voltar para acomodação” tinha área de toque de 32×32 px e não declarava foco visível. Agora tem área de 44×44 px, contorno de foco e o cabeçalho reduz recuos e tipografia em telas estreitas para reservar espaço ao título.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — comodidades duplicadas em links compartilhados (2026-10-17)

URLs podiam conter rótulos equivalentes para a mesma comodidade (por exemplo, jacuzzi, hidromassagem e hidro). Como todos ativam o mesmo critério de busca, apareciam vários chips e remover só um mantinha o filtro efetivamente ativo. A leitura dos parâmetros agora reconhece a identidade canônica usada pelo matching e conserva somente o primeiro rótulo, que também será preservado pelo link sincronizado.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — resumo de preço no checkout em telas estreitas (2026-10-17)

O resumo do imóvel usava recuos grandes no celular, e as linhas de diária, taxas e total não reservavam espaço para o valor. Agora o cartão reduz o padding em telas pequenas, permite que nomes longos quebrem em mais de uma linha e mantém cada valor monetário inteiro e alinhado à direita. A identificação do imóvel também pode encolher sem empurrar a imagem nem alargar o diálogo.

Validação: build, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. A revisão em dispositivo de 320 px continua pendente. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — resultados completos da busca por disponibilidade (2026-10-17)

A [Stays limita `/booking/search-listings` a 20 anúncios por requisição](https://stays.net/external-api/), enquanto o catálogo atual contém mais anúncios e a interface filtra localmente a lista recebida. O adaptador de busca agora percorre páginas com `skip` até uma página incompleta, preserva a validação de disponibilidade e noites cotadas, remove IDs repetidos e só retorna o conjunto depois de completar a paginação. Se uma página da busca datada falhar, o resultado inteiro continua em erro, sem apresentar uma lista parcial como completa. Busca com `limit` explícito mantém esse limite.

Validação: `npm run build`, ESLint no serviço, Prettier e `git diff --check` passaram. Não executei testes, chamadas Stays reais ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — destino no fallback local da busca (2026-10-17)

O catálogo local aplicava o destino apenas a título/subtítulo, diferente da busca normal que também inclui cidade, estado, bairro e condomínio. A regra agora é compartilhada entre o filtro de resultados e o fallback local, mantendo os mesmos imóveis visíveis durante uma falha da API.

Validação: build, ESLint nos arquivos alterados, Prettier e `git diff --check` passaram. Não executei testes, sandbox, chamadas Stays reais ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — separação entre banheira e hidromassagem (2026-10-17)

Uma regressão reintroduziu `banheira` como sinônimo de jacuzzi/hidromassagem, apesar da correção anterior para banheiras termais comuns. Os filtros agora tratam banheira como comodidade própria; “banheira de hidromassagem” continua correspondendo aos dois critérios pelo texto específico.

Validação: build, ESLint no utilitário, Prettier e `git diff --check` passaram. Não executei testes, sandbox, chamadas Stays reais ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — regras de estadia na faixa de disponibilidade (2026-10-17)

A faixa rápida habilitava qualquer data posterior como check-out, ainda que o intervalo tivesse noite bloqueada ou não atendesse à estadia mínima; também permitia interação com dados antigos durante atualização. Agora usa `isCalendarRangeAvailable`, como o seletor completo, e desabilita dias durante carregamento ou quando a disponibilidade não foi confirmada. O cálculo da estadia mínima considera as opções `prices[].minStay` do check-in, sem depender da ordem do array documentado pela [Stays](https://stays.net/external-api/).

Validação: build, ESLint nos arquivos do calendário, Prettier e `git diff --check` passaram. Não executei testes, sandbox, chamadas Stays reais ou inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — datas legíveis no resumo do checkout (2026-10-17)

O resumo mostrava as datas como strings ISO e sempre usava “noites”, dificultando a leitura rápida. Agora exibe datas localizadas em português com elementos `<time>` que preservam o ISO como valor semântico, permite quebra em telas estreitas e ajusta o singular para uma noite.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — limites do arraste no calendário da busca (2026-10-17)

Os dias adjacentes ao mês visível aparecem desativados e não aceitam clique, mas os eventos de toque no elemento da grade ainda permitiam iniciar ou concluir um intervalo nesses dias. O gesto agora respeita o mesmo limite do clique: só começa e termina em datas selecionáveis do mês visível, e o preview não avança por células desativadas.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. O arraste ainda precisa de confirmação em dispositivo touch. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — clareza da confirmação de disponibilidade (2026-10-17)

Os cartões e o resumo do mapa informavam “Disponível para as datas e N hóspedes”, uma frase ambígua. Agora deixam explícito que a acomodação está disponível nas datas selecionadas para o número de hóspedes da busca, tanto visualmente quanto no nome acessível dos marcadores do mapa.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — contador de tipos de imóvel ativos (2026-10-17)

Cada tipo de imóvel selecionado aparece como um chip removível, mas o badge de Filtros contava qualquer conjunto de tipos como uma única seleção. O contador agora soma cada tipo ativo, mantendo o número anunciado no botão alinhado às opções individuais exibidas e removíveis.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — retorno do checkout ao imóvel (2026-10-17)

Ao abrir o checkout, a ação fechava a página do imóvel e alterava a rota antes de mostrar o diálogo. O botão “Voltar para acomodação” terminava no catálogo. Agora o detalhe permanece montado e a URL do imóvel é mantida sob o checkout; ao fechar o diálogo, a página e o controle de reserva que o abriu continuam disponíveis, permitindo também o retorno de foco do diálogo ao acionador.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhum pedido, reserva ou pagamento foi criado.

### Continuação da auditoria — histórico do diálogo de checkout (2026-10-17)

Com o detalhe preservado sob o checkout, Voltar do navegador ainda removia a rota do imóvel sem fechar o diálogo. A abertura do checkout agora cria uma entrada de histórico na mesma URL; Voltar/Escape fecham o checkout sem sair do detalhe, e Avançar pode restaurar o diálogo enquanto a sessão mantém os dados do pedido. Ao retornar à mesma rota, o roteador preserva a instância atual do imóvel em vez de reiniciar seu carregamento.

Validação: `npm run build`, ESLint direcionado, Prettier nos arquivos compatíveis e `git diff --check` passaram. Não executei testes, sandbox ou inspeção visual; o servidor permanece parado. Nenhum pedido, reserva ou pagamento foi criado.

### Continuação da auditoria — recuperação do catálogo sem resultados (2026-10-17)

O botão de recuperação prometia restaurar todas as acomodações, mas mantinha as datas e os hóspedes da busca. A ação agora limpa todos os filtros e consulta novamente o catálogo sem datas, com a ocupação padrão. O texto explica o efeito e o botão atende ao alvo mínimo de toque e mostra foco visível.

Validação: `npm run build`, ESLint direcionado, Prettier nos arquivos compatíveis e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — preço não confirmado nos marcadores do mapa (2026-10-17)

Quando a busca por datas ainda não tem cotação, os cartões explicam que é preciso consultar o preço, mas os marcadores do mapa mostravam apenas um travessão. Os estados sem valor confirmado agora exibem “Consultar” ou “Ver preço” no marcador; o rótulo acessível continua informando o estado completo e não mostra tarifa de referência como preço confirmado.

Validação: build, ESLint direcionado, Prettier nos arquivos compatíveis e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — alvos de toque dos filtros ativos (2026-10-17)

Os chips dos filtros ativos permitiam remover critérios com botões de 24×24 px também em telas touch, dificultando desfazer datas, hóspedes ou comodidades. Os botões de remoção agora têm alvos de 44×44 px em telas menores e mantêm 24×24 px em telas maiores; “Limpar filtros” também recebe uma área vertical de 44 px no mobile. O indicador visual continua no ícone e o foco de teclado permanece explícito.

Validação: build, ESLint direcionado, Prettier nos arquivos compatíveis e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor permanece parado. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — transparência de descontos no detalhe (2026-10-17)

O detalhamento da cotação confirmada mostrava subtotal, taxas e total, mas omitia `discount` da resposta Stays, deixando uma diferença sem explicação. Agora exibe a linha “Desconto” com o valor negativo antes das taxas; cotações sem desconto não ganham uma linha vazia. Um teste isolado confirma a linha com desconto e sua ausência quando o desconto é zero.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram; `tests/propertyPriceBreakdown.test.ts` passou 2/2 e o fluxo de reserva com disponibilidade/cotação passou 1/1 localmente. Corrigi duas expectativas antigas desse fluxo: cotação falha não deve exibir “Estimativa” para as datas selecionadas, e indisponibilidade não confirmada deve ter o mesmo nome acessível da interface. Não executei teste de sandbox nem inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — comodidades no cartão com dados divididos (2026-10-17)

Os cartões leem a lista geral de comodidades, enquanto o detalhe também apresenta comodidades do apartamento e do condomínio. Quando a lista geral vinha vazia ou só com espaços, os cartões ocultavam os dados que estavam disponíveis no detalhe. Agora usam as listas específicas como fallback, mantendo a lista geral quando há itens válidos. Um teste cobre esse fallback e confirma as três primeiras comodidades registradas.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram; `tests/propertyCatalogGrid.test.ts` passou 10/10 localmente. Não executei teste de sandbox nem inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — fallback para rejeição inesperada no checkout (2026-10-17)

Os serviços de checkout convertem falhas de rede em estados indisponíveis, mas uma rejeição inesperada no carregamento de termos ou prontidão deixava o modal preso em “Verificando” e sem retentativa. O efeito agora captura rejeições, encerra o loading, informa que as condições não puderam ser carregadas e habilita “Tentar novamente”; após uma retentativa, o foco retorna à mensagem atualizada.

Validação: `npm run build`, ESLint direcionado, Prettier e `git diff --check` passaram; o teste local de rejeição das duas consultas passou 1/1. Não executei teste de sandbox nem inspeção visual. Nenhum pedido, reserva ou pagamento foi criado.

### Continuação da auditoria — seleção de datas por arraste no calendário de busca (2026-10-17)

O calendário do imóvel já permitia selecionar check-in e check-out arrastando o dedo. No calendário da busca, o gesto não atualizava porque a consulta de disponibilidade lia o atributo na camada do botão, enquanto ele estava na célula ao redor. A busca agora encontra a célula selecionável sob o dedo, pré-visualiza o intervalo e grava as duas datas ao soltar.

Validação: os testes focados de calendário, busca, retry, disponibilidade vazia e filtros passaram 31/31; ESLint direcionado, Prettier, `git diff --check` e `npm run build` passaram. Não executei teste de sandbox nem inspeção visual. Nenhuma reserva, pagamento ou publicação foi iniciada.

### Continuação da auditoria — alvos de toque nas retentativas do calendário (2026-10-18)

As duas ações de retentativa no calendário do imóvel tinham padding compacto, abaixo da altura mínima de 44 px usada nos controles touch do fluxo. Ambas agora têm altura mínima de 44 px e alinhamento central, tanto para recarregar o calendário quanto para estender o período consultado. Os alvos para fechar e navegar entre meses já usam 44 px no código atual.

Validação: 76 testes locais focados em filtros, roteamento, busca, calendário, disponibilidade e detalhe passaram; `npm run lint`, Prettier, `git diff --check` e `npm run build` passaram. Atualizei fixtures e expectativas antigas para refletir as props e os nomes acessíveis atuais. Inspecionei a página em 320 px, mas o DOM servido era de uma versão anterior do código (classes `h-9` onde a fonte atual já usa `h-11`) e não havia processo ativo na porta 3000; não considero essa captura validação visual da versão atual. As chamadas da API daquela página retornaram 500, e o calendário exibiu estado bloqueado e retry, sem permitir seleção não confirmada. Não executei teste de sandbox, reserva, pagamento ou publicação.

### Continuação da auditoria — comodidades consistentes entre cartão, filtro e mapa (2026-10-18)

O catálogo e os filtros já usavam as comodidades do apartamento/condomínio como fallback quando a lista geral estava vazia, mas o resumo do marcador selecionado no mapa ainda consultava apenas a lista geral. O mapa agora usa o mesmo helper compartilhado, então a comodidade mostrada no cartão também aparece no resumo do mapa e continua compatível com os filtros. O teste do mapa também foi atualizado para aceitar o preço junto da unidade “/ noite”, como a interface apresenta.

Validação: 22 testes locais de mapa, filtros e cartões passaram; os 26 testes de calendário de busca, acessibilidade e catálogo também passaram nesta etapa. `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Não fiz inspeção visual porque o servidor local segue parado; nenhum teste de sandbox, reserva, pagamento ou publicação foi executado.

### Reauditoria — detalhe como página e retorno à busca (2026-10-18)

O estado atual implementa o detalhe como página navegável: a rota direta e a navegação por cartão carregam `PropertyDetailPage`, com semântica de região nomeada e sem diálogo modal. Testes cobrem URL Stays/localizada, datas e hóspedes compartilhados, retorno por histórico, preservação da busca, posição e foco; o detalhe bloqueia a reserva até datas explícitas, calendário disponível e cotação confirmada.

Validação nesta reauditoria: os testes focados de rota e detalhe passaram 30/30. Os avisos de fallback do calendário/cotação vieram de chamadas relativas sem servidor no ambiente JSDOM; os testes ainda passaram e os casos substituem a API onde a resposta importa. A inspeção visual em navegador não foi repetida porque a porta 3000 está sem servidor ativo. Não executei sandbox, reserva, pagamento ou publicação.

### Continuação da auditoria — alvos de toque no painel de reserva (2026-10-18)

O botão de hóspedes e a ação “Tentar cotação novamente” tinham a área clicável menor que 44 px, embora o espaço ao redor parecesse maior. O próprio botão de hóspedes e o retry agora têm altura mínima de 44 px, incluindo no painel do detalhe.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 21/21; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. O JSDOM emitiu logs esperados de fallback para chamadas relativas de calendário/cotação em testes que não substituem esses serviços; isso não causou falha. Sem inspeção visual, sandbox, reserva, pagamento ou publicação.

### Revalidação — suíte local do fluxo de busca e catálogo (2026-10-18)

Na suíte serial, encontrei uma expectativa desatualizada no teste do modal de busca: o texto atual valida “um check-out posterior ao check-in”, enquanto o teste esperava “check-out posteriores”. Corrigi somente a expectativa. A suíte passou 268/270; os dois casos restantes estão em `reservationApiValidation.test.ts`, nos contratos de checkout direto, fora do escopo desta revisão de UX e sem alteração nesses arquivos.

O teste corrigido do modal passou dentro da suíte. A execução foi local, serial e sem sandbox; nenhum servidor, checkout real, reserva ou pagamento foi iniciado. Prettier no teste e `git diff --check` passaram.

### Continuação da auditoria — contraste e confirmação visual dos calendários (2026-10-18)

Escureci os rótulos de datas desabilitadas nos calendários da busca, do detalhe e da faixa de disponibilidade, e o texto de datas bloqueadas no detalhe. Na faixa de disponibilidade, o intervalo só recebe o destaque de estadia válida quando os dados estão confirmados e todas as noites estão disponíveis; durante atualização ou diante de uma noite bloqueada, o destaque não contradiz o estado real. O gesto de arrastar com toque na busca e no detalhe segue coberto por testes.

Validação: os testes focados de calendário, detalhe e busca passaram 36/36; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. O JSDOM registrou os fallbacks esperados para chamadas relativas de disponibilidade e preço sem servidor. Não fiz inspeção visual porque o servidor local está parado. Não executei sandbox, reserva, pagamento ou publicação.

### Continuação da auditoria — alvo touch dos dias do calendário do imóvel (2026-10-18)

Os botões dos dias no seletor do imóvel tinham 40 px de altura. Agora têm 44 px, mantendo a grade, a seleção por toque/teclado e o gesto de arraste existentes. Acrescentei uma regressão que verifica a altura mínima em todas as datas renderizadas no portal do diálogo.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 22/22; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Os logs de fallback do calendário e da cotação são esperados em testes JSDOM sem servidor. Não fiz inspeção visual, não executei sandbox, reserva ou pagamento e não publiquei.

### Continuação da auditoria — alvos de toque no calendário da busca (2026-10-18)

Na grade de sete colunas do calendário da busca, a altura dos dias dependia da largura da coluna e ficava abaixo de 44 px em telas estreitas. Os botões agora têm altura mínima de 44 px, preservando a largura adaptada à viewport para evitar overflow horizontal. O teste de acessibilidade verifica esse mínimo e o teste de arraste touch confirma que a seleção continua funcional.

Validação: `tests/staysSearchWidgetAccessibility.test.ts` passou 11/11; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Não fiz inspeção visual em dispositivo; o servidor local está parado. Não executei sandbox, reserva, pagamento ou publicação.

### Reauditoria — consistência do preço na lista e no mapa (2026-10-18)

Revisei o caminho de cotação do `/api/search` até cartões e marcadores: a resposta datada exige origem, datas e hóspedes correspondentes; cotações com noites diferentes do período são descartadas; sem preço válido os resultados continuam identificados como disponíveis, mas mostram preço pendente. Lista e mapa usam o mesmo resolvedor de exibição e o mesmo valor confirmado. Não encontrei divergência que justificasse mudança de código nesta etapa.

Validação: 18 testes de cotação, exibição no cartão/mapa, taxas e conversão passaram. O navegador existente preservava conteúdo de uma sessão anterior, e não havia processo na porta 3000; portanto, não o usei como verificação visual do código atual. Não executei sandbox, reserva, pagamento ou publicação.

### Continuação da auditoria — remoção de filtro sincronizada à URL (2026-10-18)

Acrescentei um teste integrado entre `ActiveSearchFilters` e `useSearchUrlSync`: remover uma comodidade apaga esse critério da URL e mantém datas, composição de hóspedes e categoria. A suíte também confirma que a lista aplica em conjunto os filtros de catálogo restantes.

Validação: 19 testes de chips, URL e filtros passaram; lint, Prettier e `git diff --check` passaram. O servidor local segue parado; não fiz inspeção visual, sandbox, reserva ou pagamento.

### Continuação da auditoria — imóvel selecionado no mapa após refinar filtros (2026-10-18)

Adicionei uma regressão para a transição em que um imóvel estava aberto no mapa e deixa de corresponder aos filtros. O painel do marcador acompanha o mesmo conjunto filtrado da lista e fecha quando o imóvel sai dos resultados.

Validação: 27 testes de mapa, chips, URL e filtros passaram; lint, Prettier e `git diff --check` passaram. O servidor local permanece parado; não fiz inspeção visual, sandbox, reserva ou pagamento.

### Continuação da auditoria — contagem ao editar filtros (2026-10-18)

O botão do modal de filtros mostrava uma contagem baseada nos critérios já aplicados, mesmo enquanto a pessoa alterava um rascunho local. Agora o modal calcula a contagem a cada alteração usando `filterPropertiesBySearchFilters`, a mesma regra da lista; o texto também singulariza “1 acomodação”. A busca e as propriedades passadas ao modal continuam respeitando os resultados confirmados disponíveis.

Validação: os testes de sincronização do modal, camada de overlays e filtragem passaram 9/9; `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram. Sem inspeção visual porque o servidor local está parado; não executei sandbox, reserva ou pagamento.

### Regressão — rascunho do modal de busca após atualização externa (2026-10-18)

O modal já copiava novamente destino, datas e hóspedes quando os filtros externos mudavam enquanto ele permanecia aberto. Acrescentei cobertura para evitar que um rascunho antigo volte a ser aplicado depois de uma atualização por histórico ou outro critério externo.

Validação: `tests/searchModalAccessibility.test.ts` passou 5/5; lint, Prettier e `git diff --check` passaram. Sem inspeção visual porque o servidor segue parado; não executei sandbox, reserva ou pagamento.

### Continuação da auditoria — ações responsivas do modal de filtros (2026-10-18)

Em telas estreitas, “Limpar tudo” e “Mostrar resultados” tentavam dividir o rodapé; os botões também não tinham altura mínima de 44 px. No mobile, as ações agora ficam empilhadas, “Mostrar resultados” ocupa a largura disponível e ambos os controles mantêm alvo de toque mínimo; em telas maiores, o rodapé retorna ao arranjo horizontal. Foi adicionada regressão estrutural para esses critérios.

Validação: `tests/filterModalSync.test.ts` passou 3/3; inspeção visual não realizada porque o servidor permanece parado. A primeira tentativa com `node --test` não suporta os imports TypeScript/ESM deste projeto; a suíte passou pelo runner configurado (`tsx`). Não executei sandbox, reserva ou pagamento.

### Continuação da auditoria — retry de disponibilidade no painel de reserva (2026-10-18)

Quando a consulta de disponibilidade falhava, o painel mantinha a reserva bloqueada corretamente, mas para tentar de novo era preciso abrir o seletor de datas. O painel agora oferece uma ação direta para repetir a consulta; ela aparece somente após falha, some durante o carregamento e deixa de aparecer quando a disponibilidade é confirmada. A seleção e a reserva continuam bloqueadas até a confirmação.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 23/23, incluindo falha, retry direto e recuperação. Os avisos de fallback de calendário e preço no JSDOM vieram de outros casos sem mocks de API e não causaram falha. Inspeção visual não realizada porque o servidor segue parado; não executei sandbox, reserva ou pagamento.

### Continuação da auditoria — contexto exato da busca datada (2026-10-18)

A camada `crcnBackendApi.searchAccommodations` já rejeita resultados datados sem origem Stays ao vivo e valida se entrada, saída e total de hóspedes da resposta correspondem à consulta. Acrescentei regressão para respostas com divergência em cada um desses três campos, protegendo a confirmação de disponibilidade contra contexto alheio. O roteador também esconde os cartões enquanto carrega ou falha, e a interface oferece retry/alteração da busca.

Validação focada: os testes de busca datada passaram 3/3. A suíte completa de `tests/reservationApiValidation.test.ts` passou 17/19; duas falhas na execução atual tratam de validação geral de API e retomada de checkout (linhas 347 e 443), sem relação com a busca datada. Não alterei esses casos ou contratos de checkout. ESLint, Prettier e `git diff --check` passaram; inspeção visual não realizada porque o servidor segue parado. Nenhum sandbox, reserva ou pagamento foi executado.

### Reauditoria — preço e comodidades em lista, mapa e busca (2026-10-18)

Revalidei o preço exibido em cartões e marcadores, incluindo tarifas de referência, cotações por período, totais com taxas e cotações ausentes; as duas superfícies usam `getPropertyDisplayPrice`. As comodidades resumidas também mantêm o fallback para dados do imóvel/condomínio. A filtragem, a mensagem de estado vazio, o bloqueio de resultados anteriores durante carregamento/erro e a recuperação por retry continuam cobertos. Não encontrei divergência atual que exija mudança de regra.

Validação: 38 testes serializados de catálogo, mapa, preço, filtros e estados de busca passaram. Avisos de fallback de `/api/resorts` ocorreram em JSDOM sem API local; não causaram falhas. A porta 3000 está sem processo, então não houve inspeção visual. Nenhum sandbox, reserva ou pagamento foi executado.

### Reauditoria — filtros, URL e histórico do navegador (2026-10-18)

Revalidei chips removíveis, aplicação do rascunho no modal, serialização e restauração dos critérios, preservação de parâmetros externos/rota/hash, retorno do detalhe por `popstate` e estados de loading/erro sem resultados antigos. Os critérios ativos e a mesma coleção filtrada continuam ligados ao catálogo/mapa pelo estado compartilhado; os testes não apontaram divergência que justifique alterar os handlers.

Validação: 32 testes serializados de filtros, URL, roteamento, modal e roteador passaram. Os avisos de resorts relativos no JSDOM são esperados sem servidor e não causaram falha. Nenhuma inspeção visual foi possível com o servidor local parado; não executei sandbox, reserva ou pagamento.

### Continuação — contexto atualizado ao voltar do detalhe (2026-10-18)

Uma regressão reproduziu perda de contexto: depois de alterar datas e hóspedes na página do imóvel, o botão/gesto Voltar restaurava a query antiga da entrada de catálogo, apesar de o link atual do imóvel já conter a seleção recente. Antes do roteador tratar `popstate`, a página agora atualiza a query da rota de catálogo com o contexto de reserva atual e mantém parâmetros de rastreamento, hash e estado de retorno. A URL compartilhada do imóvel continua sincronizada.

Validação: a suíte serial de detalhe/roteamento passou 32/32, incluindo a regressão que primeiro falhou com a query antiga e passou com a correção. ESLint, TypeScript/build, Prettier e `git diff --check` passaram. Inspeção visual não feita porque a porta 3000 continua parada. Nenhum sandbox, reserva ou pagamento foi executado.

### Continuação — alvos de toque nos diálogos de datas e hóspedes (2026-10-18)

A auditoria dos controles do painel encontrou o botão “Aplicar” do seletor de hóspedes e as abas Check-in/Check-out do calendário com menos de 44 px de altura. Os três agora têm altura mínima de 44 px; a suíte também protege os controles de navegação mensal e os dias do calendário.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 23/23. ESLint, Prettier, TypeScript/build e `git diff --check` passaram. Os avisos de fallback de calendário/preço vieram de casos JSDOM sem backend e não causaram falha. Sem inspeção visual porque o servidor continua parado. Nenhum sandbox, reserva ou pagamento foi executado.

### Reauditoria — estados concorrentes de calendário e cotação no detalhe (2026-10-18)

Revisei o caso em que calendário e cotação terminam em ordens diferentes. A seleção da cotação é vinculada a imóvel, datas e hóspedes; a API também rejeita respostas de outro imóvel, quantidade de noites ou moeda. O CTA só habilita com seleção explícita, cobertura completa do calendário, intervalo disponível e cotação Stays válida. Falha de calendário bloqueia a reserva e oferece retry; falha de cotação preserva o bloqueio e oferece retry próprio. A decomposição do total só aparece após cotação confirmada. Não encontrei estado contraditório que justificasse alteração de código.

Validação desta etapa: revisão estática de `usePropertyAvailability`, painel de reserva, decomposição de preço, validação da API e testes existentes. Não executei testes, build ou inspeção visual nesta etapa; a porta 3000 permanece parada. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação — ajuste mínimo do check-out ao trocar a entrada (2026-10-18)

Ao escolher um novo check-in posterior ao check-out atual, o formulário principal ajustava a saída para duas noites depois, embora a busca aceite estadias de uma noite e o seletor manual habilite o dia seguinte. Agora usa o próximo dia como saída padrão, mantendo a menor estadia permitida e reduzindo a alteração implícita do período. Seleções de intervalo por arraste e check-outs que continuam válidos não mudam.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Nenhum sandbox, reserva ou pagamento foi iniciado.

### Continuação — vazio de filtros locais sem apagar busca (2026-10-18)

Quando a consulta da Stays retornava anúncios, mas os refinamentos locais removiam todos da lista, a tela podia mostrar um estado genérico de busca vazia ou disponibilidade. Agora esse caso explica que há resultados para a busca e oferece “Limpar filtros do catálogo”. A ação limpa categoria e refinamentos locais de preço, tipo, comodidades, quartos, banheiros e anfitrião, preservando destino, datas e hóspedes. O estado de indisponibilidade real continua oferecendo alteração de datas/hóspedes.

Validação: ESLint direcionado e `npm run build` passaram. A checagem Prettier dos arquivos-alvo apontou uma formatação legada em `src/App.tsx` (imports e callback de foco fora deste ajuste); a formatação nova do catálogo foi corrigida. `git diff --check` passou. Não executei testes, sandbox ou inspeção visual; o servidor local continua parado.

### Continuação — captura do ponteiro no arraste do calendário de busca (2026-10-18)

O calendário de busca atualiza a prévia do intervalo usando coordenadas do dedo, mas o pop-up podia deixar de receber o fim do gesto se o dedo saísse da área durante o arraste. O dia inicial agora captura o ponteiro touch; o pop-up continua resolvendo a data sob o dedo e recebe o encerramento/cancelamento do gesto. Os limites de datas selecionáveis e o comportamento por clique permanecem iguais.

Validação: ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção em dispositivo touch; o servidor local permanece parado. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação — alvos touch dos campos de preço nos filtros (2026-10-18)

Os campos numéricos de preço mínimo e máximo tinham altura de linha pequena dentro de um contêiner maior, mas o próprio controle recebia o foco e a interação. Ambos agora têm altura mínima de 44 px. Os limites, os valores em reais e a regra de preço por noite antes de taxas permanecem iguais.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado.

### Continuação — alvo touch da retentativa de prontidão no checkout (2026-10-18)

O botão “Tentar novamente” que consulta a prontidão da compra no checkout tinha altura mínima de 40 px. Ajustei para 44 px, mantendo a trava enquanto a consulta está ativa. Não acionei a consulta de prontidão por navegador, nem iniciei pedido, pré-reserva ou pagamento.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado.

### Continuação — marcadores coincidentes no mapa de acomodações (2026-10-18)

A inspeção do catálogo local encontrou dois anúncios com coordenadas idênticas em Lacqua DiRoma IV. Os marcadores agora se distribuem ao redor do ponto original e recebem linhas de conexão discretas, evitando que um anúncio fique totalmente sob o outro; o texto de ajuda do mapa também informa esse afastamento. Cada anúncio segue com seu próprio botão e detalhes.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. A duplicidade foi confirmada nos dados locais; não fiz inspeção visual porque o servidor permanece parado. Não executei testes, sandbox, reserva ou pagamento.

### Continuação — alvos touch dos dados de contato no checkout (2026-10-18)

Os campos de nome, e-mail e telefone tinham altura efetiva aproximada de 42 px. Agora têm altura mínima de 44 px, facilitando o preenchimento por toque sem mexer nos labels, nas regras de validação ou no fluxo do checkout.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Não iniciei pedido, pré-reserva ou pagamento.

### Continuação — alvo touch do link de localização (2026-10-18)

O link “Abrir no Google Maps” na seção de localização tinha uma altura menor que os outros controles touch da página. Agora tem no mínimo 44 px e mantém o conteúdo centralizado, sem alterar o destino externo nem a indicação acessível de nova aba.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Nenhum sandbox, reserva ou pagamento foi iniciado.

### Continuação — alvos touch dos marcadores de preço no mapa (2026-10-18)

Os marcadores de preço clicáveis no mapa tinham menos de 44 px de altura, dificultando a seleção em telas touch. Agora mantêm o conteúdo centralizado e em uma linha, com altura mínima de 44 px; rótulos, valores e seleção de acomodação permanecem iguais.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Nenhum sandbox, reserva ou pagamento foi iniciado.

### Continuação — alvo touch da retentativa do catálogo salvo (2026-10-18)

No estado de catálogo salvo/desatualizado, “Tentar atualizar” tinha altura mínima de 40 px. Aumentei para 44 px, preservando o comportamento de desabilitar enquanto a atualização está em andamento e mantendo o alvo em uma linha.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Nenhum sandbox, reserva ou pagamento foi iniciado.

### Continuação — alvo touch do atalho da Sofia na busca (2026-10-18)

O atalho mobile para abrir a concierge Sofia tinha altura mínima de 40 px. Alinhei o botão ao mínimo de 44 px já usado nos outros controles touch de busca, sem alterar sua posição ou comportamento.

Validação: ESLint, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local continua parado. Nenhum sandbox, reserva ou pagamento foi iniciado.

### Continuação — estado vazio sem duplicidade ou falsa confirmação (2026-10-18)

Na revisão do catálogo, o modo grade podia renderizar ao mesmo tempo o estado vazio do roteador de disponibilidade e o estado próprio dos cartões quando os filtros locais removiam todos os imóveis. Além disso, o texto compartilhado dizia que a disponibilidade estava confirmada mesmo sem datas. O roteador agora deixa a grade tratar esse vazio em modo lista; mapa e diretório de condomínios continuam exibindo uma ação contextual. A mensagem só afirma disponibilidade confirmada quando há intervalo selecionado; sem datas, informa apenas que há acomodações no catálogo.

Validação: ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local permanece parado. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação — controles acessíveis no diretório de condomínios (2026-10-18)

Os botões de avançar/voltar fotos no diretório tinham 32 px e não exibiam foco visível explícito. Agora têm alvos de 44 × 44 px e contorno no foco de teclado; a ação principal sobre a foto também ganhou indicação de foco. O botão “Ver detalhes do condomínio” recebeu altura mínima de 44 px. Os nomes acessíveis e as ações não mudaram.

Validação: ESLint direcionado, `npm run build` e `git diff --check` passaram. O arquivo já tinha formatação Prettier legada, que não foi reformatada em massa. Não executei testes nem inspeção visual; o servidor local permanece parado. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação — vazio do mapa quando os filtros removem todos os imóveis (2026-10-18)

Com zero imóveis após os filtros, o mapa era montado sem propriedades e mostrava uma mensagem incorreta de falta de coordenadas. Agora o estado vazio do mapa explica quando nenhum resultado corresponde à busca e oferece acesso à busca para ajustar critérios; quando há imóveis no catálogo mas os filtros locais os removeram, mantém a ação para limpar esses filtros. O mapa só é montado quando há pelo menos um resultado filtrado. Falta real de coordenadas continua tratada pelo mapa quando existem imóveis.

Validação: ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local permanece parado. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Continuação — vazio do diretório de condomínios sem mensagem conflitante (2026-10-18)

Quando havia imóveis na busca bruta, mas os filtros locais removiam todos, o diretório também era montado vazio e dizia que nenhum condomínio existia no catálogo. Agora o diretório fica oculto nesse caso, deixando somente a mensagem que identifica filtros sem correspondência e permite limpá-los. A mensagem genérica do diretório continua disponível quando o catálogo realmente não contém resultados.

Validação: ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. Não executei testes nem inspeção visual; o servidor local permanece parado. Nenhum sandbox, reserva, pagamento ou publicação foi iniciado.

### Complemento de tipagem — callbacks do estado vazio (2026-10-18)

A checagem completa de lint/TypeScript inclui os fixtures de componentes. Atualizei os objetos compartilhados de `MainContentRouter` e `PropertyCatalogGrid` para fornecer o callback de limpar filtros que a nova ação exige. Nenhum caso de teste foi executado ou criado.

Validação: `npm run lint`, `git diff --check` e build passaram; a verificação de Prettier nos arquivos de produção relacionados passou. Não executei a suíte de testes, sandbox ou inspeção visual; o servidor local permanece parado.

### Continuação — contraste do preço no calendário de disponibilidade (2026-10-18)

Os preços pequenos da faixa de disponibilidade usavam orange-600 sobre superfícies claras (3,56:1 sobre branco), e o preço selecionado usava orange-100 sobre orange-600 (3,11:1). Agora os preços não selecionados usam orange-700; o dia selecionado também usa fundo orange-700 com texto branco. Os contrastes sólidos correspondentes são 5,18:1 no branco, 4,52:1 no fundo orange-100 do intervalo e 5,18:1 no dia selecionado. O rótulo do dia selecionado deixou de usar opacidade.

Validação: ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. Os valores foram calculados para cores sólidas; a composição final de superfícies e contraste real ainda depende de inspeção visual. Não executei testes, sandbox ou servidor.

### Continuação — condições das tarifas diárias no calendário do imóvel (2026-10-18)

A API de calendário pode retornar diversas tarifas no mesmo dia, cada uma vinculada a um mínimo de noites, e a ordem do array não define qual tarifa deve ser apresentada. A faixa agora escolhe deterministicamente a tarifa BRL mais baixa, informa o mínimo correspondente e usa “Desde” quando há alternativas. O texto auxiliar deixa explícito que a tarifa é por noite e que o total com taxas depende do período selecionado. A cotação do painel continua responsável pelo total final.

Validação: `tests/staysAvailability.test.ts` passou 7/7 casos, incluindo escolha independente da ordem, condição de mínimo igual com tarifas alternativas e descarte de BRL inválido. ESLint direcionado, Prettier, `npm run build` e `git diff --check` passaram. A interpretação do campo `minStay` segue a [referência oficial da API Stays](https://stays.net/external-api/), que o define como mínimo de noites para aplicar a tarifa. O teste foi local, sem sandbox, Stays, servidor, reservas ou pagamentos; inspeção visual permanece pendente.

### Continuação — tarifa diária compatível com a duração selecionada (2026-10-18)

Depois que o visitante escolhe um intervalo válido, a faixa agora desconsidera opções cujo `minStay` excede a duração da estadia. Se nenhuma tarifa do calendário se aplica àquele número de noites, a faixa mostra “Consultar” em vez de sugerir uma tarifa incompatível. Antes da seleção completa, continua mostrando a menor tarifa disponível com seu mínimo de noites.

Validação: `tests/staysAvailability.test.ts` passou 9/9, incluindo intervalo de duas noites com tarifa de cinco noites excluída e ausência de tarifa compatível. ESLint, Prettier, TypeScript/build e `git diff --check` passaram. Testes locais isolados, sem sandbox ou API Stays; nenhuma reserva ou pagamento foi iniciado. Inspeção visual permanece pendente.

### Revalidação integrada — busca, vazios e tarifa de calendário (2026-10-18)

Executei em conjunto os testes locais de estado de busca, roteador, lista, faixa de disponibilidade e regras de tarifas: 34/34 passaram. Dois casos do roteador emitiram o fallback esperado de `/api/resorts` no JSDOM sem servidor; isso não foi uma chamada externa nem afetou os resultados. `npm run lint`, `npm run build`, Prettier direcionado e `git diff --check` também passaram. Nenhum sandbox, servidor, API Stays, reserva ou pagamento foi usado; inspeção visual e toque em dispositivo continuam pendentes.

### Continuação — indicador de foco no cabeçalho do imóvel (2026-10-18)

Na captura do cabeçalho, o contorno de foco do botão Voltar avançava sobre a área visual de Compartilhar; as ações também ampliavam os controles no hover. O foco continua visível dentro do botão Voltar, e a barra não aplica mais escala aos três controles, evitando que invadam visualmente o espaço dos vizinhos. Na inspeção do detalhe surgiu outro foco nativo azul no título, que agora usa contorno laranja com largura limitada ao texto (`w-fit max-w-full`), mantendo a quebra em telas estreitas.

Validação: `tests/propertyDetailBookingAccessibility.test.ts` passou 23/23; `npm run lint`, `npm run build`, Prettier nos componentes e `git diff --check` passaram. A inspeção visual com Vite em 320 px e 1280 px confirmou que as ações não se sobrepõem e o foco do título fica ao redor do texto. O Vite foi encerrado ao final. As chamadas `/api/*` receberam `ECONNREFUSED` porque o backend Laravel não foi iniciado; portanto, essa inspeção confirma o layout com os dados locais, não o estado integrado de cotação/disponibilidade. O `prettier --check src/index.css` continua apontando diferenças de formatação preexistentes em outras regras do arquivo. Nenhum sandbox, reserva ou pagamento foi usado.

### Continuação — prioridade das comodidades nos cartões e filtros (2026-10-18)

Os cartões exibiam os três primeiros itens da lista geral, podendo esconder comodidades do apartamento, como Wi-Fi e ar-condicionado, atrás de itens do condomínio. Agora o resumo agrega as três fontes de comodidades e ordena primeiro as do apartamento, depois a lista geral e por fim as do condomínio; remove entradas vazias e duplicatas normalizadas. Como filtros, cartões e mapa usam o helper compartilhado, a busca também encontra comodidades específicas do apartamento mesmo quando a lista geral já contém outros itens.

Validação: 8 testes locais de comodidades e filtros passaram; `npm run lint`, `npm run build`, Prettier direcionado e `git diff --check` passaram. Não iniciei servidor nem usei sandbox, Stays, reservas ou pagamentos; inspeção visual permanece pendente.

### Revalidação — filtros, URL e roteamento do catálogo (2026-10-18)

Os testes locais de chips removíveis, rascunho/contagem do modal, serialização de URL, filtros, histórico, mapa e estado vazio passaram 38/38. A fixture da contagem agora isola também comodidades do apartamento e do condomínio, para não herdar atributos reais do anúncio-base. O filtro mantém critérios de viagem ao remover uma comodidade e o mapa acompanha o conjunto filtrado.

Validação: suíte focada, lint/TypeScript, build, Prettier direcionado e `git diff --check` passaram. Os fallbacks de `/api/resorts` em JSDOM ocorreram sem servidor, sem afetar os resultados. Não iniciei servidor, sandbox ou fluxos de reserva/pagamento; inspeção visual permanece pendente.

### Continuação — falha de cotação no detalhe do imóvel (2026-10-18)

O detalhe oferecia retry quando a API de preço rejeitava, mas apresentava a mesma mensagem usada para uma resposta sem cotação. O hook agora diferencia falha de transporte/API de uma resposta vazia, limpa o erro ao iniciar nova tentativa ou trocar o contexto, e o painel explica que não conseguiu consultar o preço mantendo a reserva bloqueada até uma cotação válida. O retry recupera o fluxo assim que a cotação confirma.

Validação: testes locais do hook e do detalhe passaram 28/28; `npm run lint`, `npm run build`, Prettier direcionado e `git diff --check` passaram. Alguns casos JSDOM imprimem logs esperados de fallback de `/api/*` sem servidor e não afetam os testes. Não usei sandbox, servidor, Stays, reservas ou pagamentos; inspeção visual integrada permanece pendente.

### Continuação — revisão de textos do visitante e fotos Stays (2026-10-18)

A revisão ampliada removeu rótulos de implementação e termos técnicos de estados vazios, busca, conta, checkout, assistente, rodapé e viagens. O checkout mantém a versão aprovada nos dados enviados, mas não exibe o identificador interno ao visitante. Mensagens de erro de conta, cancelamento e pedidos não exibem mensagens cruas do backend; os detalhes ficam nos logs. Descrições e avaliações recebidas da Stays permanecem sem edição. Badges dependentes de dados locais foram limitados a anúncios sincronizados; o detalhe deixou de afirmar uma seleção oficial sem fonte que comprove isso. Testes existentes foram alinhados aos novos textos e a fixture do mapa passou a isolar os campos que verifica.

Na validação local autenticada e somente leitura, `GET /api/accommodations/LG03J` retornou HTTP 200 com `staysSynced: true` e 34 imagens sob `crcn.stays.net`. O proxy Vite retornou as mesmas 34 imagens; na página aberta localmente, as cinco imagens renderizadas carregaram do host Stays. `GET /api/accommodations` retornou 56 anúncios e todos continham imagens Stays. A causa da galeria inicial com uma única foto foi o Laravel não estar iniciado; após carregar a configuração raiz local no processo e iniciar Laravel, a página atualizou com a galeria completa. As chaves necessárias estavam presentes na configuração canônica, sem copiar valores para o `.env` do subsistema.

Validação: `npm run lint`, `npm run build`, Prettier nos arquivos tocados e `git diff --check` passaram. A última execução completa, antes do ajuste de uma expectativa de copy, ficou em 292/295; os 99 testes focados executados depois passaram. Restam duas falhas na execução completa em `tests/reservationApiValidation.test.ts` (linhas 347 e 443), relacionadas à validação/contrato do checkout e fora da revisão de microcopy. O endpoint local de condições do checkout respondeu HTTP 503 para LG03J, então o checkout permanece bloqueado e a revisão não iniciou reserva, pagamento ou chamada de escrita à Stays. Nenhum sandbox foi usado.

### Consent Mode do Google sem alterar o gate de tags (2026-10-26)

Na carga local validada (analytics e publicidade aceitos e ID GTM válido), a fila `dataLayer` agora recebe comandos da API gtag `consent/default` com as quatro categorias negadas, seguida por `consent/update` com as escolhas autorizadas; os comandos precedem o evento customizado de preferências, `gtm.start` e a inclusão do script GTM. A preferência salva atualiza a API gtag se a camada já existe, inclusive ao revogar. Recusa inicial, escolha de apenas uma categoria e ID inválido continuam sem criar camada nem carregar script. O evento `crcn_consent_preferences` e os gates atuais foram preservados.

Os testes e verificações locais cobrem formato e ordem dos comandos, atualização após revogação, idempotência por página e bloqueio para ID inválido. Isso verifica o código local, mas não valida o container, as tags publicadas, cookies/requisições reais ou a integração no Tag Assistant. Essa validação de plataforma continua pendente antes de aprovar ou publicar os textos legais, conforme o guia oficial do [Consent Mode para sites](https://developers.google.com/tag-platform/security/guides/consent) e a documentação oficial da [data layer](https://developers.google.com/tag-platform/tag-manager/datalayer).
