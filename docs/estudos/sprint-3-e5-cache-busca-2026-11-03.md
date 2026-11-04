# E5 — Cache de busca, primeira etapa local

Implementação local, ainda sem publicação e sem considerar E5 concluída.

## Comportamento

A busca com datas usa `StaysSearchAvailabilityService`, com chaves por conta/base, versão, datas, hóspedes, imóvel, cidades ordenadas, destino, limite, página e BRL. O contexto atual não admite cupom ou preço personalizado; não reutilizar esse cache para novas modalidades sem estender as chaves e o contrato.

Um lock por chave protege a recomputação, com lease ligado ao timeout da busca mais o orçamento da cotação em lote. Timeout de espera retorna indisponibilidade, sem abrir uma recomputação paralela. Resposta inválida/falha e resultado com cotação incompleta não são armazenados. Uma resposta vazia bem formada pode ser reutilizada durante o TTL.

A validade padrão é 45 segundos, configurável até 60, contada desde o início da consulta externa. Ler do cache não renova esse prazo. `fetchedAt` e `expiresAt` chegam ao frontend; a API cliente recusa validade inválida/expirada e as vitrines persistem o mínimo entre o prazo original e o TTL local. O checkout mantém sua revalidação própria, sem consumir esse cache.

A invalidação do calendário após operações de reserva também troca a geração das buscas da conta. A geração compõe a chave, de modo que uma resposta antiga em voo não repovoará o espaço atual.

## Evidência local

- Laravel instalado: 13.35.0. Regras de cache/HTTP e documentação consultadas via Boost.
- 345 testes backend passaram; 23 de busca/cache e 15 de calendário/reserva passaram nas execuções direcionadas.
- 535 testes frontend passaram antes da inclusão do cenário adicional de prazo persistido na vitrine; consultar execução específica desse arquivo para a verificação posterior.
- Lint/TypeScript, build e Pint passaram. Build: entrada `index-DfPApHTh.js`, 475,00 kB / 138,99 kB gzip. Tamanho de artefato não mede ganho de latência.

## Pendências antes de publicar

- Comprovar a exclusão concorrente com mais de um processo usando o store escolhido, e testar timeout de lock.
- Produção foi inspecionada em modo leitura: `cache.default=file`. Confirmar estratégia de limpeza de chaves expiradas e orçamento de disco. Arquivos de cache não são compartilhados entre containers; aquecimento/invalidação entre containers exige store compatível ou estratégia explícita.
- Revisar prazo de espera versus experiência de erro/retry; falha de cache não deve derrubar operações comerciais.
- Completar catálogo descritivo com atualização resiliente, preparação/aquecimento das coleções e isolamento de jobs de pagamentos, conforme o plano E5.
- E6 ainda precisa completar continuidade visual e revalidação de resultados/detalhe. E7 precisa medir comparação integrada e ganho real.

O PR #42 e sua publicação contêm somente a política de cache negativo de assets e as evidências anteriores. A E5 local será revisada e publicada em lote posterior.

## Complemento local: store compartilhado, limpeza e exclusão concorrente

A busca agora usa `services.stays.search_cache_store`, padrão `database`, independente do cache global da aplicação. Reutiliza as tabelas existentes `cache` e `cache_locks`; não adiciona migrations ou dependências. O PostgreSQL já conectado permite compartilhar snapshots e geração de invalidação durante a troca de containers. Nos testes comuns, o store é explicitamente `array` no `phpunit.xml`.

`stays:prune-search-cache` remove somente chaves com o prefixo literal da aplicação + `stays.search.`, já expiradas. Processa no máximo quatro lotes de 500 por execução e repete o predicado de expiração ao deletar para preservar uma eventual renovação concorrente. É agendado a cada cinco minutos em processo de fundo; outros caches e a geração válida permanecem preservados. Stores não relacionais não recebem SQL de limpeza.

Dois processos PHP independentes passaram nos cenários de compartilhamento e timeout: o teste observa a tentativa real de lock ocupada antes de liberar o primeiro processo. Uma única chamada HTTP fake ocorre; o segundo processo reutiliza o mesmo snapshot ou retorna indisponibilidade após a espera limitada. A verificação local usa SQLite; o workflow de release agora também executa concorrência e limpeza no job PostgreSQL. A prova no PostgreSQL depende do CI e ainda não foi obtida.

Falha SQL do cache retorna 503 na busca sem consulta externa desprotegida. A invalidação secundária não propaga falha de cache à operação comercial. Relatórios usam mensagens genéricas, sem registrar SQL ou valores serializados. O checkout continua revalidando ao vivo; falha de invalidação deixa apenas a janela limitada pelo TTL.

Validação: suíte backend de 353 testes passou antes do último ajuste de sanitização dos relatórios; o teste específico é repetido após esse ajuste. Schedule listado localmente com `CACHE_STORE=array` (o SQLite padrão local não está provisionado), sem executar tarefas. Concurrency/limpeza/calendário/reserva foram exercitados em testes. Nenhum comando de limpeza foi executado em produção.

Pendências atualizadas: resultado do gate PostgreSQL, preparação/aquecimento de vitrines e orçamento de consultas externas, descrição resiliente, E6 e verificação integrada E7. A limpeza e a comprovação local de concorrência citadas anteriormente estão implementadas; não considerar a etapa completa com base apenas em SQLite.

## Gate PostgreSQL e preparação para catálogo

No commit `cbe51bc`, todos os checks do PR #43 passaram, incluindo o job PostgreSQL da [run 41741804662](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41741804662). O passo `Verify PostgreSQL search cache locking and pruning` executou os arquivos de concorrência entre processos e limpeza com sucesso. Essa evidência cobre aquele SHA; novos commits devem repetir os gates.

No commit `7e48c6a`, o mapeamento de acomodações saiu do controller para `StaysAccommodationMapper`, preparando a reutilização por atualização de catálogo em segundo plano. Os 353 testes backend passaram após a extração, incluindo 48 cenários direcionados. A mudança não implementa ainda os jobs ou a retenção do último catálogo válido.

## Pausa compartilhada após HTTP 429

As consultas de busca e cálculo de preço agora propagam o sinal de rate limit ao coordenador de buscas. Uma chave por conta/base pausa novos cache misses durante `Retry-After` (segundos ou data HTTP); sem valor válido, a pausa é de 15 segundos. Há limites de segurança de 1 segundo a 24 horas. Não há repetição imediata de POST nem espera ocupando worker HTTP durante essa pausa. Snapshots ainda válidos continuam disponíveis, e outras contas permanecem isoladas.

Resultados de preço parciais continuam sendo retornados com aviso e não são gravados como snapshot completo. O sinal interno de rate limit não é exposto como payload do catálogo. A pausa usa o mesmo banco compartilhado, e a chave expirada participa da limpeza existente.

356 testes backend passaram na suíte completa após a implementação. Os três casos adicionais de limites/fallback passaram na execução direcionada do arquivo, com 11 testes no total. Pint e diff sem erros. Permanecem pendentes o CI dos novos commits, catálogo resiliente/preparado, jobs isolados, aquecimento e E6/E7. A E5 segue sem publicação.

## Catálogo descritivo resiliente — etapa local

O catálogo foi extraído para `StaysAccommodationCatalog`. O namespace agora inclui versão do mapeamento e conta/base Stays. Usa `STAYS_CONTENT_CACHE_STORE=database` por padrão, mantendo o cache global existente independente. Conserva o último snapshot completo por 24 horas e tenta atualizar após cinco minutos; falha de atualização devolve o snapshot ainda dentro do limite sem renovar seu prazo. Conteúdo vazio bem formado substitui o anterior, evitando manter anúncios removidos. A montagem do snapshot requer metadados auxiliares completos quando necessários; falha dessas consultas preserva a versão anterior.

O formato JSON do catálogo e as rotas existentes foram preservados. Os prazos estão no envelope interno do conteúdo, separado da validade das cotações. A atualização ainda é síncrona: orçamento de execução, preparação das coleções, jobs únicos e worker promocional isolado continuam pendentes.

363 testes backend passaram após a mudança; 47 cenários direcionados cobriram API/catálogo/cotações. Pint e diff passaram.

A execução `e657898` revelou os seis avisos do gate PostgreSQL: ausência do arquivo `.env` no checkout de CI, reportada pelo Dotenv. As 27 asserções foram executadas. O job agora copia somente `.env.example` para `.env`, mantendo as variáveis de teste do runner, e usa `--fail-on-warning` no gate de cache. Ainda aguardar a execução sem avisos antes de encerrar essa pendência.

## Atualização descritiva em fila separada — implementação local

`RefreshStaysAccommodationCatalog` é único por chave de conta/base e usa o store compartilhado de conteúdo para o lock de unicidade. Tem duas tentativas, backoff de 15/60 segundos e é encaminhado explicitamente a `database/discovery`. O scheduler o solicita a cada cinco minutos quando Stays está configurada; o worker solicita uma atualização também ao iniciar. A versão válida do catálogo passa a ser devolvida imediatamente durante a renovação.

O job tem orçamento cooperativo de 30 segundos para leitura/mapeamento, com timeouts HTTP limitados ao saldo e verificação antes de publicar o snapshot. O caminho frio HTTP tem orçamento de 12 segundos. Um marcador de aquecimento de 60 segundos evita que chamadas frias concorram com o trabalho em fundo; ele não remove conteúdo válido. Locks de atualização duram 60 segundos. Jobs de outra conta são descartados sem consulta externa.

O container passa a ter o programa Supervisor `discovery`, com um único processo na fila homônima e `nice 10`. A fila `default` e seus workers financeiros permanecem com sua configuração anterior. A sincronização horária de conteúdo roda em processo de fundo para não segurar o scheduler. O snapshot de descoberta passa ao store compartilhado de conteúdo, e o mapper o lê uma vez por lote, inclusive quando ausente.

Leitura operacional em 03/11/2026: runtime atual sem extensão `pcntl`; portanto, o timeout Laravel sozinho não garante término. O script usa o `timeout` GNU 9.1 já presente na imagem, uma execução de worker por tentativa, limite externo de 50 segundos e SIGKILL após mais cinco. Não adiciona dependências. O limite fica abaixo do lock de 60 e do `retry_after=90` verificado em produção. `--timeout=45` continua configurado para runtimes que suportem sinais. Interrupção deixa apenas trabalho público idempotente para retry; nenhum job de pagamento entra nesse worker.

Health checks e smoke do container/imagem agora exigem cinco programas saudáveis. O smoke executa ainda um processo descartável que precisa ser interrompido com status 124, provando a disponibilidade do mecanismo externo. A validação da imagem depende do novo CI: Docker não está disponível neste host local.

Testes exercitam a fila de banco real: três leituras antigas geram um job, a fila default não o consome e discovery atualiza o catálogo. Cobrem bootstrap único, ausência de configuração, descarte de conta divergente, prazo de leitura vencido, bloqueio de concorrência fria e uma leitura do snapshot por lote. Os testes relevantes foram acrescentados ao gate PostgreSQL sem warnings.

Pint, shell syntax e diff passaram. A suíte completa atual passou com 370 testes e 2.564 asserções em 6,9 segundos. O lote ainda não foi publicado. Uma medição read-only do container atual registrou aproximadamente 160 MiB e 0,30% CPU, com cerca de 14 GiB disponíveis no host; não é medição do custo do worker novo.

Permanecem pendentes aquecimento das ofertas/coleções com orçamento do provedor e medição de custo, tratamento contextual de limite do catálogo, imagem validada com cinco programas, integração E6 e comparação E7. Não considerar E5 concluída apenas com a atualização descritiva assíncrona.

## Ajuste do isolamento do teste de fila no PostgreSQL

No SHA `5787299`, os smokes da imagem Linux passaram com cinco programas e o timeout externo. O gate PostgreSQL identificou uma falha no caso de dois disparos de bootstrap: o teste envolvia tudo na transação de `RefreshDatabase`. A tentativa de adquirir um lock já existente abortou essa transação PostgreSQL (`25P02`), impedindo a atualização subsequente do lock. O cenário real de CLI/worker usa commits independentes.

O teste de integração de fila passou a usar `DatabaseTruncation`, com limpeza antes/depois e recriação do banco SQLite em memória quando necessário. Mantém as duas requisições reais e a asserção de um único job. A alternativa de rollback por migration revelou um `down` histórico incompatível com índice no SQLite; nenhuma migration aplicada foi alterada. A limpeza ocorre exclusivamente no banco descartável de teste.

Os sete cenários do arquivo passaram localmente após o ajuste. A suíte completa e o novo gate PostgreSQL devem passar no SHA corrigido antes de considerar essa prova encerrada. Essa alteração não modifica o código de produção.

## Conteúdo auxiliar compartilhado e pausa de leitura pública

O SHA `726e5dd` passou em todos os gates; o PostgreSQL executou 13 testes/64 asserções sem warnings, incluindo a fila real após o ajuste de isolamento. O lote seguinte acrescenta os pontos abaixo e exige nova execução dos gates.

A revisão do caminho de busca identificou chamadas Stays adicionais ao mapear comodidades e condomínios, mesmo quando a cotação estava no cache. `StaysContentReadCache` compartilha essas listas por cinco minutos no store de conteúdo, por conta/base, endpoint e parâmetros ordenados. O cache aceita somente os três endpoints públicos auxiliares usados pelo mapper. Respostas malformadas e falhas não viram lista vazia válida; listas vazias válidas são reutilizadas. O payload armazenado contém somente identificadores, nomes e comodidades necessários, sem galerias ou campos de proprietário não usados pelo mapper.

A atualização completa do catálogo força a leitura nova dos auxiliares, preservando a semântica do snapshot de 24 horas. O endpoint de condomínios também utiliza a página de propriedades compartilhada. A busca comum aproveita os auxiliares válidos e conserva o prazo original da cotação.

Teste de integração com store de banco e controller recriado: a primeira busca com preço, condomínio e traduções fez quatro chamadas externas; a segunda fez zero chamadas adicionais, preservando o total de R$750 e a comodidade esperada. O cenário usa HTTP fake controlado: não é medição de latência pública ou Web Vitals.

HTTP 429 no catálogo ou nos auxiliares agora produz pausa compartilhada com os cache misses de busca pública. Cotações e metadados ainda válidos continuam disponíveis. Retry-After aceita segundos/data HTTP; pausas menores não reduzem a maior pausa existente. O job de catálogo é reagendado pelo prazo indicado e mantém unicidade suficiente para uma pausa de até 24 horas. Um teste de fila real verificou uma pausa de uma hora, ausência de consulta antecipada e recuperação posterior com uma única tarefa. Operações privadas de checkout/pagamento não passaram a usar esse cache ou coordenador.

Validação local final: 383 testes backend e 2.629 asserções aprovados; 40 cenários direcionados de conteúdo/API/catálogo passaram, além dos testes de rate limit e worker. Pint e diff passaram. O gate PostgreSQL passa a incluir os novos testes de cache auxiliar.

Uma leitura operacional GET de um anúncio ativo, limitada a um item e timeout de três segundos, retornou 200 sem cabeçalhos de cota. O corpo não foi registrado. A documentação local também não informa a cota da conta; a pergunta ficou pendente com o usuário. Aquecimento automático de ofertas/coleções, orçamento e medição do provedor continuam pendentes, junto de E6/E7. Nenhuma alteração deste lote foi publicada.


## Integração E6: validade das cotações da busca

Todos os gates do SHA `f4775e3` passaram no run `41748066790`, incluindo PostgreSQL (25 testes, 124 asserções, sem warnings) e imagem com cinco programas. Esse lote permanece na PR 43, sem deploy.

A integração seguinte aplica às cotações da busca um prazo absoluto por página: o menor entre a validade recebida do servidor e 45 segundos no navegador. A expiração usa temporizador local e verificação ao recuperar a visibilidade, sem polling da API. Cada cartão perde a indicação de disponibilidade e o total confirmado quando sua cotação expira; páginas carregadas posteriormente conservam seu próprio prazo.

Os resultados permanecem na tela durante a atualização explícita e após falha transitória. O refinamento por preço conserva o último valor apenas para manter os cartões no conjunto filtrado; a interface exige renovação para voltar a apresentar preço confirmado. Retornar do detalhe preserva páginas e posição, inclusive após expiração, com ação explícita para atualizar. Uma página de continuação expirada não consome IDs nem impede nova tentativa.

Testes direcionados cobrem prazos independentes, ausência de chamadas automáticas, retorno do detalhe, troca de contexto, falha na renovação, recuperação da paginação e remoção do selo/preço expirado. A validade da cotação própria do detalhe e os demais critérios de E6 ainda precisam de revisão; este lote não encerra E6 ou E5.

Validação deste incremento: 544 testes frontend aprovados, lint/TypeScript, build e formatação aprovados. Os 83 testes direcionados de busca, paginação, cards, mapa, filtros e roteamento também passaram. Nenhuma alteração de backend neste incremento.


## E6: validade da cotação no detalhe

O detalhe já separava a identidade do contexto (anúncio, datas e hóspedes) do objeto descritivo. Faltava limitar a vida da cotação recebida. O hook agora adiciona prazo absoluto de até 45 segundos, respeitando um prazo menor informado na resposta. Ao vencer, o temporizador local provoca a atualização visual; retomar a aba também confere a validade. Não há nova consulta automática. O calendário e o restante do detalhe permanecem montados.

O validador de preço compartilhado rejeita cotações expiradas ou com prazo inválido, inclusive na ação de continuar a reserva. O painel mostra “Cotação expirada” e oferece a tentativa de cotação existente. Alterar contexto/desmontar remove timer e listener, e descarta respostas atrasadas como antes. O prazo acompanha a cotação passada ao checkout; o servidor continua responsável por validar a operação.

Validação: 59 testes direcionados de disponibilidade, preço, API e detalhe passaram; 35 testes do detalhe foram repetidos após ajustar a tipagem explícita do callback. Lint/TypeScript, build, formatação e diff passaram. Não houve chamadas reais de reserva/pagamento nem deploy neste incremento. Permanecem os demais critérios de E6, o aquecimento de ofertas E5 e a comparação integrada E7.
