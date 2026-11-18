# Primeira publicação das otimizações de performance

Publicação autorizada pelo usuário em 03/11/2026. Concluída e verificada às 22:35:56 UTC (19:35:56 de Brasília). [PR #39](https://github.com/centraldereservascaldas/hospeda-reservas/pull/39), [pipeline de publicação](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41730311480) e [evidências verificadas](publicacao-performance-2026-11-03.json).

## Identidade e escopo

- Alvo: aplicação Coolify `7pgw9mcr2vjt5red5pswmvi6`, domínio `www.centraldereservascaldas.com`.
- Commit publicado: `84155ab61278af5c400c6e507ec7a3c22e975a38`.
- Imagem: `ghcr.io/centraldereservascaldas/hospeda-reservas@sha256:d0a41c2c9f5843b6f33d626c9ef30fa68d6c57a8d468bf013b72619b47abd876`.
- Container observado: `bf33ca9717d9`, saudável; o digest local coincide com o registrado pelo CI.
- Entrada pública: `/assets/index-CdriZiHo.js`, 471.633 bytes descomprimidos. SHA-256 `bddc59e98df611c84afe6ef246e045255ff611169fc186e1690840f8ae4bfd54`, idêntico ao arquivo no container.

O lote inclui cotações consistentes e erros parciais, imagens responsivas, cache/retenção de assets, primeira página com continuação e a fila compartilhada. A visibilidade das vitrines ainda não foi implementada; limitar concorrência não elimina todas as consultas distantes. E4 permanece em andamento. Não se trata da conclusão de E5–E7 nem de comprovação de Web Vitals no p75 real.

A main foi atualizada para preservar o commit Cielo `388f91f` já implantado. O diff de performance não acrescentou migrations. Os gates da PR e da main passaram; a imagem candidata também passou no smoke por digest antes do deploy. O workflow implantou pelo tag SHA; a identidade imutável foi conferida separadamente no runtime.

## Backup e retorno

Banco de destino identificado pelo web container: PostgreSQL 16.15, recurso `9bn7a32xssdvsi56wa3om1vv`, banco `hospeda_reservas`. Backup anterior ao deploy: `pre-performance-20261103T221948Z.dump`, 93.607 bytes, permissão 600. SHA-256 `a067e1a5e6ddbf1e0580d42a007b4166243bf4c0359de2e34d3cd8432454208a`.

O arquivo fica no diretório de backups do recurso em `/data/coolify/backups/databases/root-team-0/crcn-hospeda-reservas-postgres-9bn7a32xssdvsi56wa3om1vv/`. A restauração completa foi validada com `pg_restore --exit-on-error` em container PostgreSQL isolado, sem rede ou portas, usando o mesmo digest da imagem PostgreSQL existente. Foram confirmadas 17 tabelas e 22 migrations. A prontidão foi checada por SQL/TCP, após uma primeira tentativa detectar o servidor temporário de inicialização. O banco de produção não foi restaurado.

Referência de retorno da aplicação: commit `388f91f948a2238a47c8584d82d656b67fde17d2`, digest `sha256:f7a7d8068def6e73bbd5fe5275eabcbec656d610699e456e94d329675f3e2d69`. Um retorno deve preservar os dados atuais. A imagem anterior não contém os novos chunks; antes de voltar, considerar a continuidade de abas abertas e um conjunto compatível de assets, conforme a limitação registrada na E2. Nenhum rollback foi executado.

## Verificações públicas

- `/api/health` e `/api/ready`: HTTP 200 e `no-cache, private`.
- JS novo e JS anterior (com query de verificação para obter uma resposta nova): HTTP 200, `public, max-age=31536000, immutable`.
- Manifesto do container: 31 assets atuais e 28 retidos; entrada JS anterior presente fisicamente.
- Asset inexistente: HTTP 404, sem `immutable`. A resposta pública ainda apresenta `max-age=14400`; revisar o cache negativo no fechamento E7.
- Chromium mobile 390 × 844/DPR 2, busca de 06–08/11/2026 para dois hóspedes: uma chamada a `/api/search`, 12 registros consumidos, 12 cartões com cotação positiva em BRL para duas noites, zero cotações rejeitadas e zero falhas de cotação. Continuação indicou `nextSkip=12`, `hasMore=true`, com “Carregar mais” disponível.
- Sem overflow horizontal ou erros JavaScript nessa navegação. Nenhum checkout, reserva ou pagamento foi acionado pelo smoke.

São verificações funcionais amostrais. Não foi atribuído um ganho percentual de performance à produção a partir desse smoke.

## Alerta operacional observado

Os logs recentes têm falhas recorrentes da rotina `direct-booking:recover-reservations`. Esse comando retorna código 1 quando há itens que exigem atenção operacional; o alerta não foi tratado como ausência geral de erros do ambiente.

O comparativo agregado entre o backup anterior ao deploy, restaurado isoladamente, e o banco atual confirmou as mesmas pendências operacionais, incluindo uma ação de criação de reserva com resultado desconhecido (`reservation_write_outcome_unknown`). A implementação do comando e da rotina de recuperação não foi alterada pelo diff de performance. Os detalhes dos pedidos e dados pessoais não foram incluídos neste registro. Não foram executadas correções comerciais ou reprocessamentos manuais.

A pendência de recuperação requer revisão operacional própria. As verificações de busca, cache e saúde deste lote passaram; isso não comprova resolução desse alerta de reservas/pagamentos.
