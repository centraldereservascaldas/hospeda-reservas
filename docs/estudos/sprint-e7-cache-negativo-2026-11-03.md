# Cache negativo de assets — publicação verificada

Antecipação de um item E7 após o 404 transitório observado na publicação E4. A origem exata da divergência de entrega ainda não foi comprovada.

`public/.htaccess` agora define `no-store, max-age=0` em erros de `/assets/`, remove cabeçalhos Expires e substitui Cache-Control nas tabelas apropriadas do Apache. Respostas válidas de assets versionados continuam imutáveis por um ano. Não altera as políticas de HTML, APIs ou sessão.

O smoke existente do container agora exige 404 sem cache para GET e HEAD, sem duplicidade de Cache-Control ou Expires. Isso roda nos gates de container e da imagem publicada. Referência: [mod_headers do Apache](https://httpd.apache.org/docs/current/mod/mod_headers.html).

Validação local: Apache 2.4.66, sintaxe válida e script `docker/check-static-assets.sh` aprovado em fixture isolado na porta 3182, incluindo assets atual/anterior, HTML/API e 404 GET/HEAD. Shell syntax e diff sem erros. Docker não está disponível localmente; validação da imagem real e da configuração Linux fica a cargo do CI antes de merge.

A etapa de preparação foi concluída com CI, publicação e confirmação do cabeçalho no domínio com URL inédita, conforme registro abaixo. Cabeçalhos novos não removem respostas previamente armazenadas por intermediários. A poda temporal de assets com cache de build reutilizado e as etapas E5/E6 continuam abertas.

## Publicação verificada

O [PR #42](https://github.com/centraldereservascaldas/hospeda-reservas/pull/42) foi integrado no commit `9518dc35c9f44ad7554f6a2ae7c17e6a105988c1`. Todos os gates, publicação e deploy passaram na [release](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41740440452). Container `8fb6b098a47c` saudável; digest publicado e runtime iguais: `sha256:f73e321cb46627470b63fa4369af3747ba49c2edc5aed57537cb4a3ffdb16eff`.

No domínio público, GET e HEAD para URLs inéditas ausentes retornaram 404 com `no-store, max-age=0` e Cloudflare `BYPASS`. Health/ready retornaram 200/private, e assets atual/anterior retornaram 200/immutable por um ano. [Evidências](publicacao-cache-negativo-2026-11-03.json).

Sem migrations novas. Rollback de aplicação: digest `sha256:b7580dcdc543b39bbac7737ed3a349c49cbc9fc932f94f22855de8df56ab5804`; preservar banco atual. O backup restaurável validado na publicação E4 continua registrado no respectivo relatório. Não houve purge externo nem alterações de domínio ou infraestrutura. Permanecem pendentes poda com cache de build reutilizado, E5/E6 e comparação integrada E7.
