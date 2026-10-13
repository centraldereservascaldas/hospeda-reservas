# Plano operacional para os subagents — qualidade do frontend

Este documento transforma a auditoria e o checklist de [`frontend-quality-plan.md`](./frontend-quality-plan.md) em pacotes de trabalho executáveis. O plano principal continua sendo a fonte de requisitos e evidências; este arquivo define ordem, fronteiras de edição e critérios para delegação.

## Objetivo e limites

Concluir progressivamente as melhorias de qualidade da auditoria e tornar o checklist padrão para novas features. Preservar a API Laravel, os endpoints legados ainda usados, autenticação, disponibilidade, reservas e checkout Stays. Não fazer push, merge ou deploy. Mudanças de dependências exigem aprovação prévia.

O estado inicial desta execução contém alterações locais não commitadas em `PropertyDetailModal` e novos componentes de localização/anfitrião. O coordenador deve revisar e validar esse trabalho antes de atribuir qualquer pacote que toque nos mesmos arquivos.

## Quadro desta execução — 2026-10-12

| Pacote                          | Estado                               | Evidência / próximo passo                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — validação do trabalho local | Concluído com limitações registradas | `git diff --check`, lint, 60 testes, format check e build passaram. Build: `index` 570,21 kB / 162,16 kB gzip; `PropertyDetailModal` 45,42 kB / 11,98 kB gzip. Chromium desktop confirmou modal, mapa e perfil do anfitrião; 375 px não foi revalidado porque o controle de viewport não estava disponível. Status Stays conectado, mas calendário/cotação responderam 503 no backend e 404 nos paths consultados na API; ver evidência no plano principal. |
| 1 — acessibilidade/jornadas     | Aguardando redistribuição            | A tentativa anterior do agente encerrou por limite de uso antes de entregar; nenhuma edição foi feita.                                                                                                                                                                                                                                                                                                                                                      |
| 2 — bundle                      | Análise concluída                    | Build atual: `index` 570,21 kB / 162,16 kB gzip, acima do aviso de 500 kB. `App.tsx` importa Supabase estaticamente e autenticação inicial depende de callback/restauração. Necessário medir por módulos e testar OAuth/sessão antes de mudança; tamanhos não provam Web Vitals.                                                                                                                                                                            |
| 3 — tokens/movimento            | Aguardando redistribuição            | Análise visual ainda pendente; somente análise.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4 — decomposição de hotspots    | Análise concluída                    | `StaysNetModal.tsx` não tem consumidor em código. Em `App.tsx`, sugeridos filtro/resumo puro com testes, depois view Explore com props, por fim famílias de effects isoladas e testadas. Preservar auth, cache, endpoints, deep-link e payload da reserva.                                                                                                                                                                                                  |

Os resultados dos agentes são diagnósticos até o coordenador revisar e atualizar este quadro. Nenhuma implementação dos pacotes 5–9 está autorizada por este quadro sem distribuição explícita de ownership.

## Protocolo para todos os agentes

1. Ler `AGENTS.md`, `README.md`, este plano e a seção relevante de `docs/frontend-quality-plan.md`; ler as skills aplicáveis antes de editar.
2. Confirmar `git status` e não descartar, sobrescrever ou reformatar mudanças existentes.
3. Trabalhar somente nos arquivos atribuídos. Não editar arquivos de outro pacote; comunicar dependências ou conflitos ao coordenador.
4. Preservar contratos de API, comportamento de autenticação, fluxo de reserva e checkout. Não introduzir dependências, alterar dados de produção ou inventar mocks que escondam erros reais.
5. Executar as verificações proporcionais indicadas no pacote, revisar o próprio diff e reportar arquivos alterados, comandos/resultados, riscos e questões pendentes.
6. Não fazer commit, push, merge ou deploy. O coordenador integra, revisa e versiona cada etapa autorizada.

## Ordem e pacotes

Os pacotes 1–4 são análise sem edição e podem ser distribuídos em paralelo. Os pacotes de implementação devem ser atribuídos após consolidar as análises, respeitando as dependências e exclusividade de arquivos descritas abaixo.

### Pacote 0 — concluir e validar o trabalho local em andamento

**Responsável:** coordenador. **Estado:** aguardando validação. **Arquivos reservados:** `src/components/PropertyDetailModal.tsx`, `src/components/HostAvatar.tsx`, `src/components/PropertyHostSection.tsx`, `src/components/PropertyLocationSection.tsx`, `src/utils/propertyLocation.ts`, `tests/propertyLocation.test.ts`, `package.json`.

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

**Responsável:** um agente de análise, sem edição. **Saída:** proposta de sequência para `StaysNetModal.tsx` e `App.tsx` após concluir `PropertyDetailModal.tsx`.

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

**Responsável:** um agente de implementação por vez. **Ordem:** terminar `PropertyDetailModal.tsx`; depois `StaysNetModal.tsx`; por fim `App.tsx`. **Arquivos reservados exclusivamente ao agente ativo:** hotspot escolhido e novos módulos/tests estritamente necessários.

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
