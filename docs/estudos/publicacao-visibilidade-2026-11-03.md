# Publicação do carregamento por visibilidade — E4

Deploy incremental autorizado em 03/11/2026. [PR #41](https://github.com/centraldereservascaldas/hospeda-reservas/pull/41), [release concluída](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41738157966), [evidências](publicacao-visibilidade-2026-11-03.json).

- Commit implantado: `2a57035af27b2e8601647e66d566f9aebff476d1`; implementação `f830d47`, integração da main `a51ff02`, estabilização dos testes de tempo `77abea6`.
- Aplicação Coolify: `7pgw9mcr2vjt5red5pswmvi6`, container `2818d8803108`, saudável.
- Digest do CI igual ao runtime: `sha256:b7580dcdc543b39bbac7737ed3a349c49cbc9fc932f94f22855de8df56ab5804`.
- Entrada pública: `/assets/index-kgNU18fA.js`. SHA256 do arquivo público igual ao container: `de97c15dc3a514befdd0a4a5558bfd93620abd643966ad46da676e5be79c0753`.
- Sem migrations novas. Backup `pre-visibility-20261103T230034Z.dump`, 90.895 bytes, modo 600; restauração isolada validou 17 tabelas e 22 migrations.
- Rollback de aplicação: commit `b191f77`, digest `sha256:cfa27132bd226733fb75b67359c74ce0fa46809787c2c1f405041b01f812bdc1`. Preservar o banco atual.

## Verificações

533 testes frontend locais passaram após controlar o relógio de quatro cenários do calendário. Todos os gates de PR e main passaram, incluindo backend, frontend, PostgreSQL e container; publicação e implantação concluíram com sucesso.

No domínio público, health e ready retornaram 200/private. Assets novo e anterior retornaram 200/immutable por um ano. Busca de 06–08/11/2026 para dois adultos realizou uma consulta, exibiu 12 cartões com preço válido em BRL e paginação seguinte disponível. Nenhum erro de JavaScript ou overflow horizontal foi observado. Não houve criação de reserva ou pagamento.

Na home pública mobile 390×844, duas consultas de oito itens atenderam a área inicialmente visível. Revelar uma coleção distante elevou o total a quatro; nenhuma consulta de 20 itens do catálogo distante ocorreu. A composição pública difere do fixture controlado, que iniciou sem vitrine visível: não extrapolar os números do laboratório como redução pública comprovada. LCP/latência e p75 reais continuam pendentes.

## Ocorrência e pendências

Durante a transição, a home ainda entregou a entrada anterior; depois, um navegador recebeu 404 para o JS novo, embora o arquivo existisse no container e outra consulta recebesse 200. Novos navegadores passaram a receber o novo JS com 200 e executaram os smokes acima. A causa exata dessa divergência transitória não foi comprovada. Assets ausentes ainda retornam `max-age=14400`; antecipar a revisão do cache negativo e da janela de troca antes da próxima publicação funcional. Não houve purge ou alteração de infraestrutura.

O alerta operacional preexistente de recuperação de reservas permanece uma pendência separada; não foram executadas correções comerciais. E5–E7 permanecem abertas.
