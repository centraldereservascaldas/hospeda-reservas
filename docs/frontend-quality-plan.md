# Plano de melhorias de qualidade do frontend

## Objetivo

Aplicar as melhorias da auditoria do frontend por etapas pequenas e verificáveis, manter o Laravel e os contratos de API existentes intactos e deixar critérios de qualidade claros para novas features. Cada etapa deve ser revisada e validada antes de um commit local. Não fazer push, merge ou deploy sem autorização posterior.

## Baseline da auditoria

- Frontend: React 19, TypeScript, Vite 6 e Tailwind CSS 4.
- Backend Laravel coexistindo com serviços legados. Preservar `/api/*`, `server.ts` e as integrações existentes.
- Hotspots observados: `src/App.tsx` e `src/components/PropertyDetailModal.tsx`. O antigo `StaysNetModal.tsx` foi removido após confirmar que não tinha nenhum consumidor.
- O TypeScript partiu de `strict: false`; havia usos de `any` em serviços e componentes.
- Havia `package-lock.json` e `bun.lock`, enquanto o README instruía `npm ci`.
- O build partiu de um chunk JavaScript de aproximadamente 777 kB e uma importação dinâmica ineficaz de `src/data/staysApartments.ts`.
- Classes `animate-in`, `fade-in`, `zoom-in-95` e `slide-in-from-bottom` foram implementadas em `src/index.css` no commit `b373211`. O build confirmou as regras geradas e o suporte a movimento reduzido.
- Diversos modais não têm semântica de diálogo, associação completa de labels, nome em botões de ícone ou gerenciamento de foco consistente.

## Progresso atual

O trabalho é feito em commits locais pequenos, revisados e validados. A branch permanece sem push; a contagem abaixo é relativa ao estado de `origin/main` consultado nesta execução.

| Fase | Estado | Evidência / pendência |
|---|---|---|
| 0 — padrão de diálogo | Implementada; validação manual parcial | Testes automatizados cobrem foco inicial, contenção de Tab, Escape, retorno do foco e controles em portais fora do DOM do diálogo. Em Chromium local, detalhes e diálogos aninhados de hóspedes, datas e galeria abriram com nome/foco esperados; Escape fechou a camada superior e restaurou foco ao acionador. Outros fluxos seguem pendentes. |
| 1 — acessibilidade | Em andamento; fixes priorizados com testes | Busca, filtros, checkout, cadastro, conta, suporte, condomínio, detalhe e cartões receberam melhorias anteriores. Nesta continuação: `FilterModal` ressincroniza o rascunho após reset externo (teste de regressão); diálogos de voucher/cancelamento em `TripsView` agora têm nome, semântica modal, foco inicial/retorno e Escape; Sofia tem campo e envio nomeados, log `aria-live` e rolagem que respeita movimento reduzido; menu Minha Conta expõe seu estado, controle associado e fecha por Escape com retorno de foco; navegação do painel de proprietário informa seção atual e anuncia carregamento; calendários e seletores portaled do widget Stays ficam no ciclo de foco do diálogo; navegação mobile tem landmark nomeado, `aria-current="page"` e teste de acesso condicional ao painel do proprietário; filtros e alternância mapa/lista em `CategoryBar` mantêm nomes acessíveis em viewport estreito, e a paginação informa a posição atual. Testes automatizados cobrem essas mudanças; revisar jornadas restantes, navegador e leitor de tela. |
| 2 — tipos e dependências | Concluída para o escopo auditado | TypeScript estrito agora checa frontend, `server.ts` e testes via `tsconfig.json`; declaração local mínima tipa o uso existente de jsdom. npm é o único gerenciador; payloads externos seguem validados, incluindo agora o formato, datas, status e números da resposta do dashboard Laravel de proprietário. |
| 3 — bundle e carregamento | Em andamento; primeira redução do chunk inicial medida | Telas/modais, catálogo Stays e agora SDK Supabase estão em chunks separados. Build atual: chunk JS inicial 350,23 kB / 105,17 kB gzip e CSS 105,58 kB / 15,57 kB gzip; o chunk Supabase mede 226,85 kB / 58,83 kB gzip e ainda é solicitado de forma assíncrona no início para restaurar a sessão. A divisão reduz o JS inicial, mas não reduz bytes totais caso o chunk de autenticação seja baixado logo após a renderização. Sem medição de navegador não alegar ganho de LCP/Web Vitals; validar callback OAuth, restauração de sessão e checkout no navegador antes de encerrar a fase. |
| 4 — tokens e movimento | Parcialmente concluída | Tokens de foco, página e borda de vidro; suporte global a movimento reduzido. Rolagens acionadas pela aplicação agora usam comportamento automático quando `prefers-reduced-motion` está ativo, incluindo Sofia, busca e avaliações. Revisão visual de consistência e inventário das transições próprias nas telas principais continuam pendentes. |
| 5 — decomposição dos hotspots | Em andamento | Extraídos cálculo de preços/taxas, avaliações, comodidades, regras/políticas, localização/mapa, perfil do anfitrião, avatar, resumo/destaques/descrições/acomodações, detalhamento de preço e calendário compacto acessível de `PropertyDetailModal.tsx`. A filtragem pura e a contagem de filtros estão em utilitário testado; os controles de filtros ativos foram extraídos de `App.tsx` com remoção de destino nomeada e teste; a grade de catálogo foi separada com estados de carregamento, erro, vazio e resultados. Auth, busca e reserva seguem no componente. `StaysNetModal.tsx` foi removido por não ter consumidor; `StaysSearchWidget` continua ativo no app e na busca. Próximo: revisar seções restantes do modal e decompor outros grupos de responsabilidades de `App.tsx`, sem alterar regras de negócio. |
| 6 — lint, formatação, testes e CI | Base implementada; cobertura incremental | ESLint, Prettier, testes de foco/diálogo e workflow GitHub Actions. Em 2026-10-12, `npm run lint`, `npm test` (89/89), `npm run format:check` e `npm run build` passam; testes cobrem validação do dashboard Laravel, calendário acessível, filtros do catálogo, navegação mobile e comportamento de rolagem reduzida. Formatação segue limitada para evitar reformatar o legado. O chunk principal está abaixo do limite de aviso de 500 kB; o chunk Supabase é carregado separadamente. |
| 7 — convenções permanentes | Parcialmente concluída | Regras de qualidade foram adicionadas ao `AGENTS.md`; manter este plano atualizado com critérios e estado executável. |

### Evidência de bundle (2026-10-12)

Build reproduzido com sourcemaps em `/tmp/hospeda-reservas-bundle-report` (artefato temporário, fora do repositório): chunk inicial 570,26 kB minificado / 162,20 kB gzip. O mapa aponta React DOM (runtime), Supabase Auth e Supabase Storage/PostgREST entre as maiores contribuições. `App.tsx` consulta a sessão no início e checkout/conta também usam auth; um `import()` chamado no início só deslocaria código para outro arquivo, sem reduzir bytes transferidos. Não introduzir divisão manual do Supabase sem redesenhar e testar a jornada de inicialização de auth. `PropertyDetailModal.tsx` é 45,18 kB minificado no build atual e já é chunk carregado sob demanda; sua decomposição é prioritariamente manutenção, não redução do chunk inicial. As extrações de preço, avaliações, comodidades e políticas mantêm o chunk inicial em 570,21 kB / 162,16 kB gzip.

### Medição após isolar o SDK Supabase (2026-10-12)

Na build de produção, o chunk de entrada passou de 575,18 kB / 163,69 kB gzip para 348,34 kB / 104,42 kB gzip (redução de 226,84 kB / 59,27 kB gzip, aproximadamente 39% / 36%). `dist/index.html` referencia apenas o chunk principal; o JS principal contém uma importação dinâmica `supabase-*.js`, cujo arquivo mede 226,85 kB / 58,83 kB gzip. `App` agenda essa importação após a primeira renderização para associar listeners e restaurar sessão; os fluxos de login e checkout também continuam podendo carregar o módulo sob demanda. Isso comprova a redução do chunk síncrono e da análise inicial de JS; o total de bytes permanece praticamente igual quando a autenticação é restaurada e o chunk separado baixa logo em seguida. Não há medição real de LCP/INP/CLS. O navegador embutido estava sem servidor local (`ERR_CONNECTION_REFUSED`), então OAuth, sessão persistida e checkout precisam de smoke test visual posterior.

### Revisão manual no navegador (2026-10-12)

Em `http://localhost:3173/`, Chromium carregou o catálogo local sem erros de console. O modal de detalhes anunciou o título e moveu foco ao botão fechar. Hóspedes, calendário e galeria abriram como segundo diálogo acessível; Escape fechou a camada superior e restaurou foco ao acionador. Galeria respondeu às setas. Avaliações e comodidades renderizaram seus títulos/grupos; regras/políticas anunciaram heading de seção e subtítulos nível 4. Em viewport CSS de 375 px, `documentElement.scrollWidth` também foi 375 px e o detalhe não teve overflow horizontal. A API local não confirmou disponibilidade e o diálogo exibiu o estado existente “Não foi possível confirmar a disponibilidade”; checkout não foi acionado. Esta verificação cobre a jornada do modal em navegador, não substitui leitor de tela nem validação dos outros fluxos.

Na sequência, com os componentes de localização/anfitrião extraídos, inspeção no Chromium desktop confirmou uma role `dialog`, os títulos “Onde você estará” e “Hospedado por Central de Reservas Caldas Novas”, um iframe de mapa e o link “Abrir no Google Maps”. O backend Laravel recebeu credenciais Stays carregadas apenas no processo a partir do `.env` privado do workspace. `GET /api/stays/status` confirmou conexão; `GET /api/accommodations/JQ08G` respondeu, mas as consultas de calendário e preço para o listing selecionado retornaram `calendar_unavailable`/`quote_unavailable` (503), e chamadas diretas aos paths correspondentes no serviço Stays responderam 404. A navegação detalhada não foi reaberta após esse diagnóstico; a API deve ser investigada separadamente antes de afirmar disponibilidade/cotação ao vivo. A sessão atual não expôs controle de viewport, portanto nenhuma nova verificação móvel foi feita para esta extração.

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

- Responsável por `src/components/PropertyDetailModal.tsx`.
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
