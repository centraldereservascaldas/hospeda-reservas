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
