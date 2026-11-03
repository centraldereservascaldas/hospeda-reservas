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
