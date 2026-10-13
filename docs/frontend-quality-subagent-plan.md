# Plano operacional para os subagents — qualidade do frontend

Este documento transforma a auditoria e o checklist de [`frontend-quality-plan.md`](./frontend-quality-plan.md) em pacotes de trabalho executáveis. O plano principal continua sendo a fonte de requisitos e evidências; este arquivo define ordem, fronteiras de edição e critérios para delegação.

## Objetivo e limites

Concluir progressivamente as melhorias de qualidade da auditoria e tornar o checklist padrão para novas features. Preservar a API Laravel, os endpoints legados ainda usados, autenticação, disponibilidade, reservas e checkout Stays. Não fazer push, merge ou deploy. Mudanças de dependências exigem aprovação prévia.

Este plano começou com extrações locais pendentes em `PropertyDetailModal` e componentes de localização/anfitrião. Esse trabalho já foi validado e integrado em commits locais. O estado atual e as evidências completas ficam no plano principal; confira `git status` antes de atribuir um novo pacote.

Em 2026-10-13, os componentes que ainda estavam no diretório compartilhado foram migrados em frentes paralelas, sem conflito no `App.tsx`: busca (`search/`), condomínio e mapa (`condominium/`, `location/`), proprietário (`owner/`), reserva/viagens (`booking/`), conta (`account/`) e Sofia (`assistant/`). Cabeçalho, rodapé, logo, navegação mobile e hook de foco permanecem compartilhados. Os agentes passaram os testes focados de suas famílias; depois da integração, os gates completos passaram: 156 testes, lint/TypeScript, formatação e build.

## Quadro desta execução — 2026-10-13

### Checkpoint corrente — ações e composição dos overlays

Commits locais `1f677c4` (código) e `6869c62` (documentação) extraíram as ações de overlay para `src/hooks/useAppOverlayActions.ts` e o payload de booking para `src/types/booking.ts`. Quatro testes confirmam preservação de datas ao aplicar filtros da Sofia, ordem fechar/selecionar, estado do payload de booking sem iniciar checkout e prepend funcional do novo anúncio. `App.tsx` caiu de 294 para 280 linhas. A camada `AppOverlayLayer` continua responsável apenas por composição e lazy loading. Gates: 178/178 testes seriais, lint/TypeScript, `format:check`, build e `git diff --check`. Bundle inicial 365,39 kB / 108,86 kB gzip (mais 0,60 / 0,14 gzip vs. checkpoint anterior); CSS 107,37 / 15,78, Supabase 226,85 / 58,83, detalhe 51,65 / 13,84. Números são tamanho de artefato, não Web Vitals. Nenhum endpoint, contrato, autenticação ou reserva mudou; checkout não foi iniciado. Estado atual `HEAD=6869c62`, 151 commits à frente da referência local não atualizada `origin/main`; sem alterações rastreadas pendentes, `.DS_Store` não rastreado. Sem push/merge/deploy. Header, navegação e closures simples de fechamento permanecem; próxima extração depende de demonstrar coesão.

No Chromium local em 1600×900, o detalhe anunciou `role=dialog`, `aria-modal=true` e nome pelo título; 40 Tabs permaneceram contidos e Escape devolveu foco ao cartão acionador. O calendário/cotação ainda estavam em loading e avaliações mostravam indisponibilidade no instante da captura. O perfil automatizado compartilhado estava ocupado e impediu revalidar 320/375 px ou emular movimento reduzido nesta rodada; leitor de tela e contraste medido seguem pendentes. Nenhuma reserva/checkout foi acionada.

### Checkpoint histórico — composição dos overlays

Os oito overlays foram extraídos para `src/components/AppOverlayLayer.tsx`, preservando imports lazy, `DeferredModal`, estados e callbacks. Teste de integração cobre montagem adiada e ação de fechar busca. `App.tsx` passou de 354 para 294 linhas; o novo componente tem 202 linhas. Gates: 174/174 testes, lint/TypeScript, `format:check`, build e `git diff --check`. Bundle inicial 364,79 kB / 108,72 kB gzip (aumento de 1,10 kB / 0,42 kB gzip vs. checkpoint anterior); CSS 107,37 / 15,78, Supabase 226,85 / 58,83, detalhe 51,65 / 13,84. São tamanhos de artefato, não Web Vitals. Código/documentação nos commits `b21c39d` e `19b8d21`; `main` está 148 commits acima da referência local `origin/main` não atualizada. `.DS_Store` permanece fora dos commits. Nenhum backend/contrato Stays/auth/reserva/checkout foi modificado; sem push/merge/deploy. QA manual recente cobriu desktop 1600×900 e viewport estreito efetivo de 469 px, 30/40 Tabs em detalhe/filtros, Escape e retorno do foco; pedido de 375×812 foi limitado pelo browser e não prova os breakpoints 320/375. Leitor de tela, contraste medido e comparação visual de movimento permanecem pendentes; a sessão não permitiu emular reduced-motion. Smoke autenticado, auditoria de allowlist/adaptadores e handlers restantes de `App.tsx` também permanecem.

### Checkpoint histórico — decomposição do catálogo

No commit `525c04c`, os cálculos derivados do catálogo foram extraídos de `App.tsx` para `src/hooks/useExploreCatalogViewModel.ts`, com teste para filtragem, categorias, favoritos, condomínios e status loading/erro. `App.tsx` tem 354 linhas (370 antes da etapa). Passaram 172/172 testes, lint/TypeScript, `format:check`, build e `git diff --check`; JS inicial 363,09 kB / 108,19 kB gzip, CSS 107,37 / 15,78, chunk Supabase 226,85 / 58,83 e detalhe 51,65 / 13,84. São tamanhos de artefato, sem inferência de Web Vitals. A branch está 143 commits à frente da referência local `origin/main` sem fetch (142 após o commit de código e 143 após a atualização documental); `.DS_Store` permanece intocado. Sem alterações de backend, autenticação, Stays ou reserva, sem push/merge/deploy. Próximos itens seguem sendo auditorias manuais e smoke autenticado, além da decomposição do wiring/overlays restante.

### Validação de metadados externos opcionais — 2026-10-13

No commit `f1999c1`, `isProperty` passou a rejeitar tipos inválidos em `complexName`, `complexDescription`, `staysSynced`, `reviewsSynced` e campos opcionais de avaliações (`authorAvatar`, `source`, `publicationStatus`). Testes cobrem entradas malformadas e review válido; a consulta local ao Laravel mostrou 56 anúncios `stays-live` e zero rejeitados pelo validador novo. Gates: 173/173 testes, lint/TypeScript, `format:check`, build e `git diff --check`. JS inicial 363,69 kB / 108,30 kB gzip; CSS 107,37 / 15,78; Supabase 226,85 / 58,83; detalhe 51,65 / 13,84. A variação em relação ao build anterior é de bytes do artefato, sem inferência de Web Vitals. `main` estava 145 commits acima da referência local `origin/main` sem fetch. Sem alteração de contratos Laravel/Express, Stays, autenticação ou reserva; sem push/merge/deploy.

### Atualização de evidência do deep link — 2026-10-13

A partir de `HEAD=33f0060` (143 commits acima da referência local, sem fetch), Chromium local abriu a rota localizada da casa LG07J com `from=2027-03-01`, `to=2027-03-05` e `persons=10`; o app exibiu o imóvel correto, as datas e 10 hóspedes e normalizou a URL para `guests=10&adults=10`. Depois do carregamento, a interface marcou o calendário como sincronizado, desativou todas as datas do intervalo, mostrou valores indisponíveis e manteve a ação de disponibilidade desabilitada. GET Laravel somente leitura limitado a 01–05/03/2027 retornou `source=stays-live`, cinco registros com `avail=0`/`price=null`, corroborando o estado indisponível. Nenhum checkout ou reserva foi iniciado. Isso não valida cotação nem demais datas. Não houve override de viewport estreito neste passo. A atualização documental desta evidência deixa a branch 144 commits à frente da referência local.

### Atualização de evidência — 2026-10-13

Consulta autenticada local posterior ao checkpoint anterior: GET Laravel `/api/accommodations` retornou 56 anúncios `stays-live` e os 56 tinham URL de imagem no host observado `crcn.stays.net`; GET de detalhe retornou galeria com 30 fotos. A correção passou a mapear o contrato obrigatório do frontend sem copiar preço/review/host de outro fixture, preserva a galeria de detalhe e evita combinar fixture cujo `staysListingId` não coincide. O Chromium isolado confirmou catálogo e ação “Mostrar todas as 30 fotos”. A descrição concatenada de “Sobre este espaço” agora ganha separação de seções/listas e tipografia hierárquica, coberta por caso de regressão.

O parser também aceita `persons` como quantidade total de hóspedes e resolve o deep link Stays `/pt/apartment/{id}/{slug}`. Um teste de navegação confirma URL, datas e composição de hóspedes; o browser local mostrou check-in 01/03/2027, check-out 05/03/2027 e 10 pessoas no formulário e detalhe, sem iniciar reserva.

Esse resultado fecha a leitura local de host de imagem e a confirmação de galeria para a amostra observada, mas não prova allowlist abrangente nem disponibilidade/cotação para todos os anúncios. Continuação: o teste `Stays localized apartment URL opens the listing with date and persons filters` cobre a rota localizada com `from=2027-03-01&to=2027-03-05&persons=10`; no browser, calendário e cotação foram observados ao vivo para uma estadia de 13–15/10/2026 e o CTA permaneceu sem acionamento. O smoke autenticado ainda não pôde começar: navegador desconectado e mensagem “O serviço de login ainda não está configurado”; não foi inserida credencial nem iniciada reserva. Ainda faltam conta/runtime de QA, leitor de tela, contraste manual, walkthrough completo em tela estreita, comparação visual de movimento, auditoria de adaptadores e dos handlers/overlays restantes em `App.tsx`. Nenhuma reserva/pagamento foi concluído; sem push/merge/deploy.

Checkpoint do código: commit `d4f3c00`, registrado quando `main` estava 135 commits à frente da referência local `origin/main` (não atualizada por fetch). Gates do commit `b9ed4d8`: 164/164 testes frontend (serial), lint/TypeScript, `format:check`, build, 21/21 testes Laravel e Pint. A correção visual isolada passou 165/165 testes; a extração seguinte do roteador de views passou 168/168 testes, lint/TypeScript, `format:check`, build, Prettier dos planos e `git diff --check`; backend não foi alterado. O modal de detalhe está concluído. `App.tsx` caiu de 479 para 376 linhas com `MainContentRouter`; restante de header, navegação, estado e overlays segue a decompor. O walkthrough manual amostral em tela estreita verificou Escape/foco de retorno no detalhe e nos filtros; a correção de padding de wrapper vazio passou teste e captura. Permanecem walkthrough completo de teclado em 320/375, leitor de tela, contraste medido, comparação visual de movimento, smoke real de sessão/login/checkout, calendário/cotação Stays, decisão sobre `messageToHost`, avaliação dos adaptadores sem consumidores internos e composição residual de `App.tsx`. Esta extração partiu de uma branch 136 commits à frente da referência local `origin/main` (sem fetch). Nenhuma reserva ou pagamento foi enviado; sem push, merge ou deploy.

Atualização posterior: o código seguiu até `9b30bab` (branch local 137 commits à frente da referência local de `origin/main`, sem fetch); `App.tsx` mantém 376 linhas. No Chromium local, filtros e busca abriram com foco interno; após 50/40 Tabs o foco ainda estava dentro de cada diálogo, e Escape restaurou o foco aos acionadores. Essa é uma checagem amostral no viewport padrão, não cobre percurso completo em 320/375, leitor de tela, contraste manual nem comparação de movimento. Nesta revisão, suíte completa 168/168, lint/TypeScript, build, `format:check`, Prettier dos planos e `git diff --check` passaram. Backend não foi alterado. `.DS_Store` permanece fora do Git; sem push, merge ou deploy.

Após o commit `931d255`, a etapa de `DeferredModal` foi validada em `169/169` testes, lint/TypeScript e build. O teste confirma que o modal não monta antes de abrir e permanece montado ao fechar; `App.tsx` passou de 376 para 368 linhas. A consulta ao segundo anúncio confirmou duas noites e R$347 em `source=stays-live`, sem iniciar reserva. Nenhuma credencial foi inserida e o login segue sem configuração no runtime local.

Após o commit `4d6b715`, `AuthCallbackNotice` foi extraído para `src/components/account/` e coberto em teste para anúncio de erro/sucesso e fechamento. `App.tsx` tem 370 linhas. Resultado: 171/171 testes, lint/TypeScript, `format:check`, build e `git diff --check`; bundle inicial 362,64 kB / 108,20 kB gzip. No browser, detalhe abriu e Escape restaurou foco ao cartão. Uma reabertura mostrou brevemente calendário atualizando, CTA desabilitado e cotação ainda visível; GETs diretos seguintes retornaram sucesso Stays, então isso fica registrado como transição de loading, sem evidência de falha persistente. Viewport estreito não foi reconfigurado porque o browser de teste estava ocupado.

| Pacote                          | Estado                                                                   | Evidência / próximo passo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — validação do trabalho local | Gates passaram no checkpoint atual                                       | Estado atual no hook de ações de overlay: `npm test -- --test-concurrency=1` passou 178/178; lint/TypeScript, `format:check`, build e `git diff --check` também passaram. A falha de carregamento da primeira rodada não se reproduziu isoladamente nem na repetição serial. PHP: 21 testes/92 assertions e Pint passaram no checkpoint backend anterior. Consulte o checkpoint corrente do plano principal para medições e limites. Sessão autenticada e fluxo ao vivo da Stays seguem pendentes.                                                                                                                                                                                 |
| 1 — acessibilidade/jornadas     | Parcial; teclado e axe corrigidos em 320/375                             | Chromium isolado em 320/375 confirmou documento sem overflow e ausência de sobreposição entre CTA de busca e Sofia. Axe-core 4.14.0 passou em 10 combinações: início, detalhe, busca, filtros e conta nos dois viewports; os alvos da galeria e fechar detalhe passaram após ajuste. Escape e retorno do foco, setas na busca e contenção de foco nos filtros foram verificados. Leitor de tela, contraste medido, preenchimento completo de todos os formulários e sessão/checkout autenticados ainda faltam.                                                                                                                                                                     |
| 2 — bundle                      | Parcialmente implementado                                                | Supabase foi movido para chunk assíncrono e build medido; a restauração de sessão ainda solicita esse chunk cedo. Login usa email/senha; sessão persistida e checkout ainda precisam de smoke test autenticado, sem concluir reserva ou pagamento. OAuth social está fora do escopo confirmado. Tamanhos não provam Web Vitals.                                                                                                                                                                                                                                                                                                                                                    |
| 3 — tokens/movimento            | Inventário estático concluído; comparação visual pendente                | Inventário estático anterior encontrou 3 tokens globais, 53 `transition-all`, 52 `transition`, 43 `transition-colors`, 21 `animate-in` e 85 `backdrop-blur`; as contagens não foram repetidas após as últimas alterações. A regra global de `prefers-reduced-motion` cobre animações/transições e a `.category-filter-track` redefine `will-change` para `auto`. Em Chromium isolado a preferência `reduce` foi emulada; ainda falta comparar visualmente antes/depois em telas representativas. Axe/viewport em 375 CSS px não detectou overflow horizontal do documento. Revisar contraste de superfícies translúcidas e não alegar desempenho sem perfil real de backdrop blur. |
| 4 — decomposição de hotspots    | Modal concluído; revisão final de `App.tsx` em andamento                 | O modal mantém coordenação de estado compartilhado e guarda do callback; demais seções, dialogs e hook estão extraídos. Catálogo/cache, roteamento, workspace, bootstrap/listener Supabase, catálogo derivado, view router, overlay e ações de overlay têm módulos e testes. `App.tsx` agora tem 280 linhas. Header, navegação e closures simples de fechar permanecem; duas chamadas existentes a `/api/accommodations` e métodos sem consumidores internos continuam como decisões dependentes de logging/config e compatibilidade externa. Quatro testes cobrem ações de overlay. OAuth/checkout autenticados e leitor de tela permanecem residuais.                            |
| 5 — integração de dados         | Catálogo, galeria e duas amostras de disponibilidade/cotação confirmados | GET local `/api/accommodations` retornou 56 itens `stays-live`; detalhe de um anúncio exibiu 30 fotos. Calendário/preço `source=stays-live` foram confirmados para dois anúncios no mesmo intervalo; teste de rota localizada cobre `from`, `to` e `persons=10`. A amostra não prova o catálogo inteiro nem allowlist completa.                                                                                                                                                                                                                                                                                                                                                    | Ampliar amostras em outros anúncios/períodos, observar hosts legítimos e decidir allowlist; nunca concluir reserva/pagamento. |

Os resultados dos agentes são diagnósticos até o coordenador revisar e atualizar este quadro. Para o objetivo ativo, o usuário autorizou commits locais progressivos; mantenha ownership de arquivos separado e não faça push, merge ou deploy.

## Protocolo para todos os agentes

1. Ler `AGENTS.md`, `README.md`, este plano e a seção relevante de `docs/frontend-quality-plan.md`; ler as skills aplicáveis antes de editar.
2. Confirmar `git status` e não descartar, sobrescrever ou reformatar mudanças existentes.
3. Trabalhar somente nos arquivos atribuídos. Não editar arquivos de outro pacote; comunicar dependências ou conflitos ao coordenador.
4. Preservar contratos de API, comportamento de autenticação, fluxo de reserva e checkout. Não introduzir dependências, alterar dados de produção ou inventar mocks que escondam erros reais.
5. Executar as verificações proporcionais indicadas no pacote, revisar o próprio diff e reportar arquivos alterados, comandos/resultados, riscos e questões pendentes.
6. Não fazer commit, push, merge ou deploy. O coordenador integra, revisa e versiona cada etapa autorizada.

## Ordem e pacotes

Os pacotes 1–4 são análise sem edição e podem ser distribuídos em paralelo. Os pacotes de implementação devem ser atribuídos após consolidar as análises, respeitando as dependências e exclusividade de arquivos descritas abaixo.

### Pacote 0 — validar o trabalho local e registrar o resultado

**Responsável:** coordenador. **Estado:** concluído; evidência atualizada progressivamente no plano principal. Arquivos antes reservados foram liberados para pacotes sequenciais após os commits locais.

- Conferir as extrações de localização, mapa, anfitrião e avatar contra o comportamento anterior.
- Rodar `git diff --check`, `npm run lint`, `npm test`, `npm run format:check` e `npm run build`.
- Fazer uma verificação visual do modal em navegador se o ambiente local estiver disponível; anotar qualquer limitação da API local.
- Atualizar o plano principal com resultado e novo baseline do bundle.

**Aceite:** verificações passam; links/estados para coordenadas válidas e inválidas permanecem corretos; mapa e perfil continuam renderizando sem regressão; diff e evidências são registrados. Não atribuir outros pacotes nesses arquivos antes de encerrar esta etapa.

### Pacote 1 — mapa de risco das jornadas e acessibilidade restante

**Responsável:** um agente de análise, sem edição. **Saída:** relatório no retorno ao coordenador, sem arquivo novo.

- Revisar busca, filtros, autenticação/conta, cadastro de anúncio, detalhe, checkout hospedado, suporte e telas do proprietário.
- Comparar estados de carregamento, sucesso, vazio e erro, labels, nomes acessíveis, foco, teclado e viewport estreito com o checklist do plano principal.
- Separar lacunas confirmadas por inspeção de itens que exigem navegador, leitor de tela, API local ou dados autenticados.
- Ordenar achados por severidade e indicar arquivo/componente e um critério de aceite reproduzível.

**Aceite:** cada achado tem evidência ou está explicitamente marcado como hipótese/pendência de ambiente; nenhuma edição de código.

### Pacote 2 — evidência de bundle e estratégia de carregamento

**Responsável:** um agente de análise, sem edição. **Saída:** relatório de composição com baseline e alternativas.

- Reproduzir o build e identificar os maiores módulos/chunks com artefatos temporários fora do repositório.
- Verificar carregamento de telas, dados Stays, React e Supabase, incluindo restauração de sessão e callback OAuth.
- Propor mudanças mensuráveis sem editar dependências nem alterar o fluxo de sessão.
- Separar tamanho transferido, tamanho gzip e métricas de runtime; não inferir Web Vitals a partir do build.

**Aceite:** relatório registra comando, números, método e limitações; qualquer estratégia que implique nova dependência ou mudança de autenticação fica como decisão para o usuário/coordenador.

### Pacote 3 — revisão de tokens e movimento

**Responsável:** um agente de análise, sem edição. **Saída:** inventário priorizado.

- Inspecionar tokens de `src/index.css` e componentes representativos em desktop e viewport estreito.
- Localizar valores repetidos, estados semânticos inconsistentes e animações que não respeitem movimento reduzido.
- Recomendar migração incremental sem mudar identidade visual, sem tema escuro presumido e sem reformatar o legado.

**Aceite:** cada recomendação aponta os arquivos e risco visual; indicar o que requer validação manual. Não editar arquivos.

### Pacote 4 — mapa de decomposição dos hotspots

**Responsável:** um agente de análise, sem edição. **Saída:** proposta para decompor `App.tsx` após concluir `PropertyDetailModal.tsx`; o antigo `StaysNetModal.tsx` foi removido após verificar ausência de consumidores.

- Identificar responsabilidades, estado compartilhado, chamadas externas e regras que não devem ser movidas ou duplicadas.
- Propor cortes pequenos com ownership de arquivos não sobreposto e testes/invariantes adequados.
- Não refatorar o widget de reserva sem cobertura das regras de disponibilidade, preço e datas.

**Aceite:** cada corte descreve dependências, risco de comportamento, arquivos e critério verificável; nenhuma edição.

### Pacote 5 — aplicar lacunas acessíveis priorizadas

**Responsável:** um agente por pacote de arquivos, execução sequencial após o Pacote 1. **Arquivos:** serão atribuídos pelo coordenador a partir dos achados confirmados; um agente não recebe arquivos de outro.

- Corrigir somente problemas confirmados e de escopo fechado; reutilizar o padrão de diálogos já existente.
- Cobrir regressões com testes de nomes/labels, foco, teclado e estados acessíveis conforme o caso.
- Preservar fluxos de busca, login, reserva e checkout.

**Aceite:** testes relevantes falham antes e passam depois para ao menos uma regressão representativa; lint e build passam; roteiro manual atualizado para o que a automação não cobre.

### Pacote 6 — aplicar estratégia comprovada de bundle

**Responsável:** um agente, após o Pacote 2 e decisão do coordenador. **Arquivos:** atribuídos em uma execução isolada, em princípio `src/App.tsx`, imports de telas/dados e configuração Vite quando indispensável.

- Implementar somente a alternativa aprovada com benefício comprovável e fallback de carregamento/erro.
- Não alterar autenticação, callback OAuth ou dependências sem decisão explícita.
- Repetir a medição nas mesmas condições do baseline.

**Aceite:** comparação reproduzível antes/depois, navegação e estados de erro verificados; build passa. Se nenhuma divisão segura compensar, documentar a decisão e encerrar sem alteração de código.

### Pacote 7 — adoção gradual de tokens e movimento

**Responsável:** um agente por grupo pequeno de componentes, após o Pacote 3. **Arquivos:** atribuídos em lotes exclusivos; `src/index.css` é reservado ao coordenador para consolidar tokens.

- Aplicar apenas tokens existentes/aprovados e ajustes de movimento reduzido identificados.
- Comparar telas representativas antes/depois; evitar mudanças de marca ou reformatação em massa.

**Aceite:** consistência demonstrável em telas do lote, sem regressão visual conhecida; movimento reduzido respeitado; build passa.

### Pacote 8 — decompor hotspots restantes

**Responsável:** um agente de implementação por vez. **Ordem:** terminar `PropertyDetailModal.tsx`; depois `App.tsx`. **Arquivos reservados exclusivamente ao agente ativo:** hotspot escolhido e novos módulos/tests estritamente necessários. `StaysNetModal.tsx` foi removido por estar sem uso; não remover `StaysSearchWidget`, que tem consumidores ativos.

- Extrair uma responsabilidade apresentacional por mudança antes de mover estado ou lógica de reserva.
- Para cada extração, manter entradas/saídas e regras existentes; adicionar teste para cálculo/invariante quando a lógica pura for isolada.
- Não dividir simultaneamente dois hotspots nem editar API Laravel/Express.

**Aceite:** responsabilidade fica clara, sem estado duplicado ou mudança de contrato; verificações e navegação do fluxo afetado passam; tamanho do chunk reportado sem prometer redução quando a meta é manutenção.

### Pacote 9 — fechar CI e checklist permanente

**Responsável:** coordenador, com análise de um agente se necessário. **Arquivos reservados:** `package.json`, workflow de CI, `AGENTS.md` e documentação de qualidade.

- Conferir que os comandos documentados em `README.md` coincidem com CI e lockfile oficial.
- Confirmar cobertura para acessibilidade, tipos, estados de interface, APIs, viewport, movimento e testes.
- Manter formatação incremental para não reescrever o legado.

**Aceite:** comandos são reproduzíveis; CI executa lint, testes e build; checklist está alinhado ao projeto Laravel + React/Vite; nenhuma dependência foi mudada incidentalmente.

## Integração, sequência e encerramento

1. Coordenador fecha Pacote 0 e atualiza o estado real no plano principal.
2. Pacotes de análise 1–4 podem correr em paralelo porque não editam arquivos.
3. Coordenador consolida os relatórios, define prioridade e distribui um único pacote de implementação por conjunto de arquivos.
4. Após cada pacote: revisar diff, repetir verificações afetadas, registrar evidência e criar commit local isolado conforme a autorização vigente. Não enviar ao remoto.
5. Marcar cada pacote como concluído somente com seus critérios satisfeitos; itens dependentes de acesso/ambiente ficam pendentes com evidência da limitação.
6. O objetivo só termina quando todos os itens aplicáveis do checklist permanente foram atendidos ou quando cada pendência residual estiver documentada com motivo, impacto e decisão necessária.

## Modelo de despacho

> Execute somente o Pacote N de `docs/frontend-quality-subagent-plan.md`. Leia as instruções e skills aplicáveis. Respeite os arquivos reservados e o estado compartilhado do Git. Para pacote de análise, não edite arquivos. Para pacote de implementação, faça apenas a mudança atribuída, rode as verificações do pacote, revise seu diff e retorne evidências, arquivos, comandos/resultados, riscos e dependências. Não faça commit, push, merge ou deploy.
