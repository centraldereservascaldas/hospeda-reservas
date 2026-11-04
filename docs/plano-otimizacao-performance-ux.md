# Plano de otimização de performance e experiência

Atualizado em 04/11/2026. **Escopo E0–E7 implementado, publicado e verificado.** Release funcional final `1d3c80d`, após as entregas incrementais. [Relatório final, comparação e limites](estudos/entrega-e0-e7-2026-11-04.md). Aquecimento de ofertas está implementado/testado e permanece desligado até definir a cota; observabilidade contínua e p75 real são acompanhamento operacional. O primeiro preço da home mobile fria não teve ganho comprovado; a busca explícita, LCP mobile, estabilidade e volume melhoraram nas amostras. Registros anteriores são checkpoints históricos.

Registro da Sprint 0: [versão publicada, método e resultados da E0](estudos/baseline-performance-e0-2026-11-03.md). Telemetria de backend e p75 real permanecem pendentes, explicitados no registro.

## Objetivo e limites

Reduzir o tempo até o primeiro resultado útil, as consultas à Stays e o trabalho de renderização, mantendo disponibilidade e preços corretos. Entregar melhorias em etapas independentes e mensuráveis, sem alterar a autorização da compra ou os contratos existentes durante a transição.

A execução do plano foi autorizada por sprints. Commits locais por progresso e publicação incremental foram solicitados em 03/11/2026. Cada publicação depende dos gates, integração da main atual e conferência do alvo/rollback. Mudanças de infraestrutura fora do deploy continuam dependendo de solicitação explícita. Preservar as alterações preexistentes no worktree `codex/calendario-responsivo-cache` e o backend legado.

## Evidências e incertezas

| Origem                       | Evidência da revisão                                                                                                      | Limite da conclusão                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Produção, home sem interação | 16–17 chamadas a `/api/search` em aberturas observadas                                                                    | Não é uma média de tráfego real                                          |
| Produção, viewport 390 × 844 | LCP de aproximadamente 6,4 s em uma execução; imagem LCP com lazy loading                                                 | Sem limitação controlada de CPU/rede; não representa p75                 |
| Produção                     | Imagens de 1.280 px exibidas a 270 px; 84 imagens no DOM em uma captura                                                   | DOM não equivale a quantidade de downloads concluídos                    |
| Produção                     | Vitrines com datas e total misturadas a cartões com datas e “Ver disponibilidade”                                         | Nas respostas datadas capturadas, todos os resultados tinham cotação     |
| Produção                     | Catálogo genérico alcançado perto de 4.040 px de rolagem no mobile                                                        | Observação de uma composição da home                                     |
| Produção                     | Assets versionados com cache de quatro horas; HTML e catálogo `private`; imagens Stays com cache longo                    | Não prova ausência de cache interno no servidor                          |
| Código local                 | Busca carrega páginas sequencialmente antes de resolver; geração ignora respostas antigas sem cancelar consultas          | Não atribuir automaticamente esse comportamento ao artefato publicado    |
| Código local                 | Backend pode remover uma cotação inválida e manter o imóvel no resultado                                                  | Explica um caminho possível, sem reproduzir esse caso na busca publicada |
| Código local                 | Calendário do imóvel já bloqueia entradas e saídas inválidas; há cache/deduplicação de calendário em alterações pendentes | Revisar e aproveitar esse trabalho antes de criar outra solução          |
| Contrato Stays local         | Existem `isBookable` na busca e `listingIds[]` no cálculo de preço                                                        | Confirmar semântica vigente, limites e payloads antes de usar            |

O build local e 49 testes direcionados passaram durante a revisão anterior. São evidências datadas, não aprovação das futuras implementações. A home publicada tem vitrines ausentes nesta cópia local; identificar sua fonte é uma dependência obrigatória.

## Priorização e estimativa

P0 identifica pré-requisito; P1, gargalo ou correção com alto impacto; P2, redução adicional de custo e melhoria de interação. O impacto é uma hipótese qualitativa a validar. As estimativas são dias de trabalho de uma pessoa familiarizada com o projeto e incluem implementação, revisão e testes proporcionais; não incluem esperas por acesso, provedor ou aprovação de publicação.

| Etapa | Prioridade | Entrega                                       | Impacto principal                                 | Esforço    | Dependências                                  |
| ----- | ---------- | --------------------------------------------- | ------------------------------------------------- | ---------- | --------------------------------------------- |
| E0    | P0         | Alinhar artefato e estabelecer baseline       | Permite comparar versões e resultados confiáveis  | 0,5–1 dia  | Nenhuma                                       |
| E1    | P1         | Resultado reservável e cotação consistente    | Confiança e redução de consultas improdutivas     | 1,5–3 dias | E0; contrato Stays confirmado                 |
| E2    | P1         | Imagens e cache de assets                     | LCP e visitas recorrentes                         | 1–2 dias   | E0; fonte das vitrines identificada           |
| E3    | P1         | Primeira página e paginação incremental       | Tempo até primeiro resultado; menos payload/DOM   | 2–3 dias   | E1                                            |
| E4    | P1         | Fila prioritária, deduplicação e cancelamento | Menos concorrência e trabalho obsoleto            | 1,5–3 dias | E3                                            |
| E5    | P1         | Vitrines e cache compartilhado no backend     | Menos consultas externas por visita; estabilidade | 2–4 dias   | E0/E1; integrar à E4 para consumo progressivo |
| E6    | P2         | Estados visuais e revalidação contextual      | Estabilidade visual e menos consultas repetidas   | 1–2 dias   | E3/E4; conciliar calendário pendente          |
| E7    | P1         | Verificação integrada e avaliação de entrega  | Comprovar ganho sem regressões                    | 1–2 dias   | E1–E6                                         |

Total estimado: **10,5–20 dias de trabalho**, sem somar itens opcionais abaixo. Pode aumentar se o código publicado não estiver disponível ou se o contrato real da Stays exigir adaptações. Não é prazo de calendário. E2 pode ocorrer após E0, em paralelo lógico às correções de busca; E5 pode iniciar a preparação de cache após E1. Paralelismo exige divisão de arquivos e revisão de integração.

## Execução por sprints

| Sprint | Escopo  | Esforço estimado | Saída verificável                                                   | Estado                                                                                                                       |
| ------ | ------- | ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S0     | E0      | 0,5–1 dia        | Artefato identificado, amostras e instrumentos reproduzíveis        | Baseline de laboratório concluído; observabilidade real pendente                                                             |
| S1     | E1 + E2 | 2,5–5 dias       | Ofertas consistentes, imagem principal e cache de assets corrigidos | E1/E2 publicadas; CI Docker e smoke público passaram                                                                         |
| S2     | E3 + E4 | 3,5–6 dias       | Primeira página independente, fila, deduplicação e cancelamento     | E3/E4 publicadas; visibilidade validada no domínio público                                                                   |
| S3     | E5 + E6 | 3–6 dias         | Cache compartilhado, vitrines progressivas e continuidade visual    | Publicada e validada em 1d3c80d; cache/renovação/geometria conferidos; aquecimento implementado e desligado até definir cota |
| S4     | E7      | 1–2 dias         | Comparação integrada, regressões verificadas e proposta de entrega  | Concluída: 24 navegações e seis buscas no artefato final; sem regressão acima dos limiares E0, com limitações explícitas     |

As implementações e publicações foram feitas em base isolada, preservando o worktree preexistente `codex/calendario-responsivo-cache` e o backend legado. Os registros de cada sprint conservam o estado observado em sua data; o relatório final acima é a referência do fechamento. Calendário agregado, nova hierarquia da home e perfil Android permanecem opcionais, fora da entrega core.

## E0 — Alinhar versões e medir

**Trabalho:** identificar SHA, origem e artefato que geram a home publicada, sem publicar; localizar a implementação das vitrines. Registrar consultas por finalidade, contexto, cache e momento de disparo. Repetir baseline com cache frio/quente, mobile/desktop e perfil fixo de CPU/rede. Reutilizar telemetria disponível; não adicionar ferramenta ou dependência sem avaliar necessidade.

**Aceite:**

- Fonte das vitrines e divergências entre produção e checkout local documentadas no registro da etapa.
- Ao menos três execuções por cenário controlado, com mediana e variação, usando o mesmo conjunto de datas/hóspedes e conteúdo comparável.
- Medidas de LCP, CLS, bytes, quantidade de chamadas, tempo até primeiro cartão com total e tempo até primeira página utilizável.
- Medir INP em interações definidas e, quando houver tráfego suficiente, em dados reais; não estimar INP de uma navegação ociosa.
- Planejar contadores de chamadas externas, hit ratio e latência p50/p95 sem registrar tokens, dados pessoais ou segredos. Se não houver amostra suficiente para percentis, informar quantidade e distribuição observadas.

## E1 — Disponibilidade e preço consistentes

Registro local: [entrega e validação da E1](estudos/sprint-1-e1-2026-11-03.md).

**Trabalho:** validar o filtro `isBookable` e os limites de cotação em lote com documentação vigente e testes isolados. Normalizar resultados por imóvel, período, ocupação, moeda e condições comerciais. Completar cotações ausentes em lote, com orçamento de tempo e concorrência. Reservar a apresentação de oferta para contexto completo e válido; sugestões sem cotação têm outra apresentação e levam à busca.

**Aceite:**

- Todos os cartões da lista principal de uma busca datada têm disponibilidade e total válidos para o mesmo contexto.
- Ausência de preço não é interpretada como indisponibilidade; erro parcial tem aviso e retentativa próprios.
- Validação de mínimo de noites, regras de entrada/saída, taxas, moeda, período e hóspedes coberta por testes; não presumir que o nome do filtro cobre todas as regras.
- Nenhum valor de catálogo ou cotação de outro contexto é apresentado como total confirmado.
- Vitrines mostram datas e ocupação de referência; sugestões sem cotação não parecem ofertas confirmadas.
- Preservar a revalidação autoritativa de disponibilidade e preço no checkout. Cotação em cache não garante reserva.

**Áreas:** `AccommodationController`, `StaysExternalApiClient`, `crcnBackendApi`, `useAccommodationSearch`, helpers de preço e fonte publicada das vitrines.

## E2 — Imagens visíveis e cache HTTP de assets

**Trabalho:** identificar a imagem LCP por composição e breakpoint. Torná-la prioritária, mantendo lazy loading abaixo da dobra. Adotar variantes de tamanho com `srcset`/`sizes` se o provedor suportar; caso contrário, avaliar serviço de transformação e custo antes de introduzi-lo. Reservar proporções de imagem. Usar cache longo apenas para recursos com versionamento confiável.

**Aceite:**

- Imagem principal visível sem lazy loading; não marcar toda a galeria ou todas as vitrines como prioridade alta.
- Tamanho selecionado adequado à largura e DPR, sem perda visual significativa; quantificar redução de bytes no cenário fixo.
- JS/CSS com hash recebem `public, max-age=31536000, immutable`; arquivos sem hash têm política compatível com atualização.
- Assets de versões anteriores permanecem disponíveis durante a troca, evitando falhas em páginas já abertas.
- Comparação de LCP e bytes antes/depois; nenhuma regressão de CLS ou recorte importante em 320/390/768/1280 px.
- Não colocar HTML, APIs pessoais ou respostas com sessão em cache público por regra genérica.

## E3 — Primeira página completa e próximas sob demanda

Progresso local em 03/11/2026: serviço e interface de página única integrados, com 12 registros brutos iniciais, “Carregar mais”, retentativa sem perder cartões, deduplicação e cancelamento por contexto. Filtros e contagens explicitam o escopo carregado. Comparação controlada e evidências: [registro da E3](estudos/sprint-2-e3-2026-11-03.md). Catálogo genérico e vitrines ainda dependem das próximas etapas; esta validação não representa p75 de produção.

**Trabalho:** substituir busca ilimitada por página inicial pequena. Começar avaliando 12 resultados, ajustando por medição. Entregar a página sem esperar o catálogo inteiro. Adicionar metadados de continuação sem quebrar consumidores existentes. Renderizar próximas páginas com “Carregar mais” e antecipação opcional.

**Aceite:**

- Uma requisição do navegador obtém a primeira página; eventuais lotes internos de cotação são medidos separadamente.
- Falha na segunda página preserva a primeira e oferece retentativa sem duplicações.
- `total` de uma página não é apresentado como total global. Usar `hasMore`/cursor/offset conforme o contrato validado.
- Ao excluir resultados sem cotação, avançar pelo número bruto consumido, mantendo paginação correta. Limitar o trabalho de preenchimento de uma página.
- Filtros e ordenação têm semântica global coerente: não declarar vazio porque somente a primeira página foi filtrada localmente.
- Montar apenas páginas entregues; preservar posição, contexto e retorno do detalhe. Não introduzir virtualização sem evidência de necessidade.

## E4 — Fila por página/seção

Progresso: fila publicada; gate por IntersectionObserver/fallback, páginas limitadas por data/área, cancelamento por visibilidade e reutilização de cotações validados localmente. A entrega usa demandas visíveis e não antecipa seções distantes. O complemento foi publicado em `2a57035` e validado no domínio público; ver [registro da E4](estudos/sprint-2-e4-2026-11-03.md) e [publicação](estudos/publicacao-visibilidade-2026-11-03.md).

**Trabalho:** usar um agendador compartilhado no frontend. Unidade de trabalho: página de resultados ou seção de ofertas, sem consulta de disponibilidade por cartão. Iniciar com duas requisições de dados concorrentes; priorizar ação explícita sobre antecipação. Acionar `IntersectionObserver` perto da próxima área, considerando também a rolagem horizontal das vitrines.

**Aceite:**

- Home parada consulta apenas a primeira área necessária; zero consultas de seções distantes antes da aproximação.
- Mesma chave normalizada compartilha requisição em andamento; nova busca remove trabalhos obsoletos e aborta fetches sem consumidores.
- Resposta antiga nunca sobrescreve contexto atual e paginação antiga não continua após cancelamento.
- Prefetch pode ser cancelado para liberar capacidade à ação do usuário; checkout não fica atrás de tarefas promocionais.
- Pausar antecipação em aba oculta e respeitar economia de dados quando detectável, com fallback funcional.
- Testes verificam concorrência, prioridade, deduplicação, desmontagem, cancelamento e recuperação de erro.
- Registrar que abortar fetch não garante interromper uma chamada externa já iniciada; o backend também limita carga.

## E5 — Cache e preparação de vitrines no backend

**Trabalho:** consolidar dados da primeira vitrine e servir seções preparadas, sem recalculá-las para cada visita. Aquecer ofertas com jobs únicos e concorrência limitada, separados de pagamentos. Conservar o último catálogo descritivo válido durante atualização. Cachear auxiliares, detalhes e buscas conforme contexto. Confirmar driver, worker, scheduler e orçamento Stays antes de escolher infraestrutura.

| Dados                                 | Política inicial proposta                           | Condição                                            |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Descrições, comodidades e condomínios | Validade maior e atualização em segundo plano       | Janela máxima de conteúdo antigo definida por tipo  |
| Ofertas, busca, calendário e cotação  | TTL curto, a calibrar; 30–60 s é ponto de avaliação | Respeitar validade do provedor e contexto comercial |
| Conta, pedidos e pagamentos           | `private, no-store`                                 | Nunca usar cache compartilhado de visitantes        |

**Aceite:**

- Chaves incluem conta/base Stays, versão do mapeamento e contexto relevante: imóvel, datas, composição de hóspedes, moeda, cupom, filtros, ordem e página; normalizar arrays e IDs.
- Uma recomputação por chave concorrente; lock com duração ligada ao orçamento real de execução e tratamento de 429/backoff.
- Conteúdo descritivo continua disponível em falha transitória; falha externa não é gravada como lista vazia válida.
- `fetchedAt`/`expiresAt` distinguem conteúdo reutilizável de disponibilidade expirada. Disponibilidade expirada não sustenta badge de confirmação.
- Invalidar após reserva/bloqueio e eventos suportados; TTL cobre alterações externas não notificadas. Resultado comercial específico por usuário não é compartilhado.
- Jobs promocionais não atrasam reconciliação de pagamento nem notificações críticas.
- Em cache quente, leituras idênticas dentro da validade não geram novas consultas Stays; medir também recomputações e custo de aquecimento.
- Cache público de HTML fica fora da primeira entrega: avaliar separadamente cookies de sessão, personalização e exclusões antes de habilitar.

## E6 — Continuidade visual e consultas do detalhe

**Trabalho:** skeletons com geometria dos cartões; erro/retry por seção; atualizar sem apresentar preço antigo como atual. Usar contexto estável nas dependências de cotação e calendário. Pausar renovação de calendário em aba oculta e renovar ao retomar conforme validade. Versionar cache local e limitar idade/tamanho.

**Aceite:**

- Skeletons não recebem foco nem leitura como imóveis reais; região com `aria-busy` e mensagem agregada de status.
- “Carregar mais” acessível por teclado; foco e scroll preservados ao voltar do detalhe.
- Atualizar fotos/descrição do mesmo imóvel não dispara nova cotação se datas, hóspedes e condições forem iguais.
- Expiração da disponibilidade impede confirmação desatualizada; nova validação não apaga desnecessariamente toda a interface.
- Limitar indicadores da galeria a poucos controles com contador, sem um Tab para cada foto.
- Validar loading, sucesso, vazio, erro parcial, retry e movimento reduzido nos breakpoints definidos.

## E7 — Validar ganho e preparar entrega

**Trabalho:** repetir os cenários de E0, revisar o diff e executar testes proporcionais de frontend/backend, lint, build e formatação. Para PHP alterado, seguir o Pint previsto em AGENTS. Testar com fakes/simulador; validações reais somente leitura e com volume limitado. Preparar unidades de entrega reversíveis, sem publicar nesta fase.

**Aceite funcional:** cotação e disponibilidade corretas; contratos antigos preservados ou transição compatível; busca, detalhe, autenticação, favoritos, checkout e acesso de proprietário sem regressão nos fluxos afetados. Nenhuma compra real para medir performance.

**Aceite de performance:**

- Zero consultas promocionais distantes na abertura; fila respeita limite e prioridade.
- Primeira página independe das seguintes; cache quente elimina consultas externas repetidas durante a validade.
- Melhorar mediana do tempo até primeiro resultado útil e LCP contra E0, sem regressão relevante nos demais cenários; registrar valores absolutos e variação, não apenas percentual.
- Definir em E0 o limiar de regressão conforme a variabilidade; não aprovar com uma única execução favorável.
- Metas de acompanhamento real: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no p75, separados por dispositivo. Não declarar cumprimento sem amostra suficiente; laboratório é comparação controlada.
- Rever antes da próxima publicação funcional o cache negativo de assets ausentes (404 público com `max-age=14400` e divergência transitória de entrega observada no lote E4) e a remoção de assets expirados em builds com cache reutilizado.
- Registro por etapa contém versão, cenários, medidas antes/depois, testes e pendências. Dados de teste distinguem cache frio, quente e falha do provedor.

Publicação futura depende de solicitação explícita, conferência de CI/workflows e checklist Coolify. Rollback deve reverter o artefato ou a funcionalidade, preservando banco, pedidos e pagamentos. Não restaurar banco nem reverter migrations automaticamente para desfazer otimização.

## Itens opcionais após o núcleo

- **Calendário agregado da busca — 3–5 dias, dependente de E1/E5:** indicar intervalos compatíveis com ao menos um mesmo imóvel e ocupação durante toda a estadia. Não unir dias livres de imóveis diferentes nem consultar todos os calendários na abertura. Preservar o calendário do imóvel existente.
- **Revisão da hierarquia da home — 1–2 dias, dependente de E0/E5:** reduzir vitrines antes do catálogo e destacar busca/“Todas as acomodações”. Validar descoberta, acesso aos resultados e conversão, sem esconder filtros essenciais.
- **Perfil gráfico — 0,5–1 dia de investigação:** medir blur, sombras e rolagem em Android intermediário; alterar efeitos somente se houver custo demonstrável.
- SSR amplo, troca de framework, biblioteca de virtualização e nova infraestrutura de cache não são pré-requisitos deste plano. Avaliar apenas se os resultados do núcleo justificarem custo adicional.

## Referências locais

- [Plano de qualidade do frontend](frontend-quality-plan.md).
- [Fluxo Stays e checkout](stays-checkout-flow.md).
- [Checklist operacional](checklist-implementacao-coolify-hospeda-reservas.md).
- Código principal: `src/services/crcnBackendApi.ts`, `src/hooks/useAccommodationSearch.ts`, `src/hooks/useAccommodationCatalog.ts`, `src/hooks/useAccommodationRouting.ts`, `src/components/property/PropertyCatalogGrid.tsx`, `src/components/property/usePropertyAvailability.ts`, `app/Http/Controllers/Api/AccommodationController.php`, `app/Services/StaysExternalApiClient.php` e o novo serviço de calendário pendente no worktree.
