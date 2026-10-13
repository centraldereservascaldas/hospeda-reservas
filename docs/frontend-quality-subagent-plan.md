# Plano operacional para os subagents — qualidade do frontend

Este documento transforma a auditoria e o checklist de [`frontend-quality-plan.md`](./frontend-quality-plan.md) em pacotes de trabalho executáveis. O plano principal continua sendo a fonte de requisitos e evidências; este arquivo define ordem, fronteiras de edição e critérios para delegação.

## Objetivo e limites

Concluir progressivamente as melhorias de qualidade da auditoria e tornar o checklist padrão para novas features. Preservar a API Laravel, os endpoints legados ainda usados, autenticação, disponibilidade, reservas e checkout Stays. Não fazer push, merge ou deploy. Mudanças de dependências exigem aprovação prévia.

Este plano começou com extrações locais pendentes em `PropertyDetailModal` e componentes de localização/anfitrião. Esse trabalho já foi validado e integrado em commits locais. O estado atual e as evidências completas ficam no plano principal; confira `git status` antes de atribuir um novo pacote.

Em 2026-10-13, os componentes que ainda estavam no diretório compartilhado foram migrados em frentes paralelas, sem conflito no `App.tsx`: busca (`search/`), condomínio e mapa (`condominium/`, `location/`), proprietário (`owner/`), reserva/viagens (`booking/`), conta (`account/`) e Sofia (`assistant/`). Cabeçalho, rodapé, logo, navegação mobile e hook de foco permanecem compartilhados. Os agentes passaram os testes focados de suas famílias; depois da integração, os gates completos passaram: 156 testes, lint/TypeScript, formatação e build.

## Quadro desta execução — 2026-10-13

### Atualização de evidência — 2026-10-13

Consulta autenticada local posterior ao checkpoint anterior: GET Laravel `/api/accommodations` retornou 56 anúncios `stays-live` e os 56 tinham URL de imagem no host observado `crcn.stays.net`; GET de detalhe retornou galeria com 30 fotos. A correção passou a mapear o contrato obrigatório do frontend sem copiar preço/review/host de outro fixture, preserva a galeria de detalhe e evita combinar fixture cujo `staysListingId` não coincide. O Chromium isolado confirmou catálogo e ação “Mostrar todas as 30 fotos”. A descrição concatenada de “Sobre este espaço” agora ganha separação de seções/listas e tipografia hierárquica, coberta por caso de regressão.

O parser também aceita `persons` como quantidade total de hóspedes e resolve o deep link Stays `/pt/apartment/{id}/{slug}`. Um teste de navegação confirma URL, datas e composição de hóspedes; o browser local mostrou check-in 01/03/2027, check-out 05/03/2027 e 10 pessoas no formulário e detalhe, sem iniciar reserva.

Esse resultado fecha a leitura local de host de imagem e a confirmação de galeria para a amostra observada, mas não prova allowlist abrangente nem disponibilidade/cotação atuais. Ainda faltam smoke autenticado de sessão/login/checkout, leitor de tela, medição manual de contraste, walkthrough completo de formulários e tela estreita, comparação visual de movimento e auditoria final dos pontos restantes em `App.tsx`/checklist. Nenhuma reserva/pagamento foi concluído; sem push/merge/deploy.

Checkpoint anterior em 2026-10-13: `main` estava 131 commits à frente da referência local `origin/main` (não atualizada por fetch); correções recentes em `841ab5b` e `cce3e5f`. Veja a atualização de evidências no início deste plano para a consulta autenticada Stays, rota compartilhável `persons` e os gates mais recentes. Permanecem contraste manual/leitor de tela, sessão/login e checkout autenticados, validação de calendário/preço Stays, decisão de produto sobre `messageToHost`, confirmação dos efeitos/compatibilidade dos adaptadores e avaliação do wiring residual de `App.tsx`. Nenhuma reserva ou pagamento foi enviado.

| Pacote                          | Estado                                                    | Evidência / próximo passo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — validação do trabalho local | Gates passaram no checkpoint atual                        | `npm test -- --test-concurrency=1` 164/164, lint/TypeScript, format check, build e `git diff --check` passaram com validação de calendário, imagens externas, favoritos persistidos e noites de preço calculado. Bundle atual e evidências estão no checkpoint corrente do plano principal; sessão autenticada e fluxo ao vivo da Stays seguem pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1 — acessibilidade/jornadas     | Parcial; teclado e axe corrigidos em 320/375              | Chromium isolado em 320/375 confirmou documento sem overflow e ausência de sobreposição entre CTA de busca e Sofia. Axe-core 4.14.0 passou em 10 combinações: início, detalhe, busca, filtros e conta nos dois viewports; os alvos da galeria e fechar detalhe passaram após ajuste. Escape e retorno do foco, setas na busca e contenção de foco nos filtros foram verificados. Leitor de tela, contraste medido, preenchimento completo de todos os formulários e sessão/checkout autenticados ainda faltam.                                                                                                                                                                                                                                                                                                                                          |
| 2 — bundle                      | Parcialmente implementado                                 | Supabase foi movido para chunk assíncrono e build medido; a restauração de sessão ainda solicita esse chunk cedo. OAuth, sessão persistida e checkout ainda precisam de smoke test autenticado, sem concluir reserva ou pagamento. Tamanhos não provam Web Vitals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3 — tokens/movimento            | Inventário estático concluído; comparação visual pendente | Inspeção encontrou 3 tokens globais, 53 `transition-all`, 52 `transition`, 43 `transition-colors`, 21 `animate-in` e 85 `backdrop-blur`. A regra global de `prefers-reduced-motion` cobre animações/transições e a `.category-filter-track` redefine `will-change` para `auto`. Em Chromium isolado a preferência `reduce` foi emulada; ainda falta comparar visualmente antes/depois em telas representativas. Axe/viewport em 375 CSS px não detectou overflow horizontal do documento. Revisar contraste de superfícies translúcidas e não alegar desempenho sem perfil real de backdrop blur.                                                                                                                                                                                                                                                       |
| 4 — decomposição de hotspots    | `PropertyDetailModal` concluído; `App.tsx` em andamento   | O modal mantém coordenação de estado compartilhado e guarda do callback, cobertas por teste de payload e bloqueio sem disponibilidade/valor ao vivo; demais seções, dialogs e hook estão extraídos. Catálogo/cache, roteamento, leituras de workspace autenticado e bootstrap/listener Supabase foram extraídos e testados; as duas chamadas existentes a `/api/accommodations` permanecem, com consolidação pendente de decisão sobre logging/config do serviço legado. `App.tsx` tem 479 linhas; quatro testes cobrem ações de conta, sete cobrem o hook de busca/URL, um teste integrado cobre tabs/teclado do SearchModal, testes cobrem sanitização de mídia em catálogos/caches/reservas/painel e o ramo de erro do calendário. Composição de views/wiring, boundary externo, OAuth/checkout autenticados e leitura de tela permanecem residuais. |
| 5 — integração de dados         | Catálogo e galeria confirmados; disponibilidade parcial   | GET autenticado local `/api/accommodations` retornou 56 itens `stays-live` com imagens `crcn.stays.net`; detalhe de um anúncio exibiu 30 fotos. `persons` e rota Stays localizada também foram confirmados. Calendário/cotação seguem sem confirmação por resposta 503 anterior. A amostra não prova uma allowlist completa de mídia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Reinvestigar calendário e cotação com Stays, observar hosts de todas as mídias legítimas e decidir allowlist; nunca concluir reserva/pagamento no teste. |

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
