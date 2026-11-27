# E7 — latência anterior à aplicação cliente

Release observado: `08c76aeef25060d2793b8f8d15bccfe534c90cc1`, entrada `/assets/index-Ctl2nyOA.js`. Diagnóstico somente de leitura, sem alteração de produção, reservas ou pagamentos.

## Evidências

- Seis navegações mobile (três pares frio/quente), JavaScript da página desabilitado, mesma emulação CDP da E0: todas 200, zero requisições `/api/`, POP GRU. Frio significa contexto novo do navegador, sem limpar caches externos.
- TTFB frio: 1.346,6 / 1.018,5 / 1.025,6 ms; quente: 1.027,8 / 446,5 / 513,7 ms. O atraso existe antes de executar React ou consultar disponibilidade.
- Campos observados `cfOrigin`: 1.032 / 900 / 916 ms nas navegações frias; `cfEdge`: 19 / 18 / 9 ms. Preservamos nomes e valores, sem assumir equivalência perfeita com outros campos da API de analytics.
- Cinco GETs HTTPS locais no VPS, passando pelo proxy real e validando certificado: TTFB 157 / 86 / 71 / 185 / 72 ms. Cinco pelo domínio público a partir do VPS: 388 / 276 / 184 / 137 / 197 ms. Mesma execução curl por série, conexões reutilizadas após a primeira; sem emulação CDP. Não comparar diretamente com os tempos do navegador.
- Probe separado confirmou HTTP/2 na origem e TTFB de 160 ms. Proxy `traefik:v3.6`; nenhuma opção de access log ou timeout entre os prefixos explicitamente inspecionados. Isso não demonstra toda a configuração efetiva.
- Correlação com marcadores exclusivos de diagnóstico: um GET direto e um público apareceram uma vez cada nos logs do container publicado; apenas contagens foram extraídas, sem expor linhas de acesso. O GET público retornou 200/TTFB 1.307 ms. Isso confirma o destino dessas duas requisições, sem medir a duração interna delas.

A documentação da Cloudflare define o TTFB da origem como rede mais processamento, visto da edge: [definição oficial](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.timings.origin_ttfb_msec/). Portanto, esses valores não são tempo puro de PHP. HTTP/2 na origem permite reutilização, mas o suporte local não comprova a configuração efetiva da conta: [HTTP/2 to Origin](https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/).

## Decisão e próxima etapa

O diagnóstico reforça a latência anterior à aplicação cliente; não demonstra causa única, distância geográfica, regressão de infraestrutura desde E0 ou culpa do worker. Nenhuma correção especulativa de React, cache público de HTML ou configuração global do proxy foi aplicada.

Próxima etapa: consultar no painel Cloudflare as regras efetivas, protocolo/conexões para a origem e latência por localização, correlacionando com uma nova série pública e observação da origem. Acesso ao painel foi solicitado sem pedir segredos. Critério: explicar a parcela lenta com evidência e repetir o baseline completo após eventual ajuste; os limiares E0 continuam valendo. A ressalva de performance da entrega E7 permanece aberta.

Dados: [navegação](sprint-4-e7-navigation-2026-11-04.json), [HTTPS](sprint-4-e7-origin-https-2026-11-04.json). Instrumento: [probe sem JavaScript](sprint-4-e7-navigation-phases.mjs). As seis navegações já foram executadas com sucesso; validação adicional do arquivo: sintaxe Node e Prettier. Não houve mudança no aplicativo que justificasse repetir toda a suíte.
