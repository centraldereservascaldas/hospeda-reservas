# Cache negativo de assets — preparação local

Antecipação de um item E7 após o 404 transitório observado na publicação E4. A origem exata da divergência de entrega ainda não foi comprovada.

`public/.htaccess` agora define `no-store, max-age=0` em erros de `/assets/`, remove cabeçalhos Expires e substitui Cache-Control nas tabelas apropriadas do Apache. Respostas válidas de assets versionados continuam imutáveis por um ano. Não altera as políticas de HTML, APIs ou sessão.

O smoke existente do container agora exige 404 sem cache para GET e HEAD, sem duplicidade de Cache-Control ou Expires. Isso roda nos gates de container e da imagem publicada. Referência: [mod_headers do Apache](https://httpd.apache.org/docs/current/mod/mod_headers.html).

Validação local: Apache 2.4.66, sintaxe válida e script `docker/check-static-assets.sh` aprovado em fixture isolado na porta 3182, incluindo assets atual/anterior, HTML/API e 404 GET/HEAD. Shell syntax e diff sem erros. Docker não está disponível localmente; validação da imagem real e da configuração Linux fica a cargo do CI antes de merge.

Pendente: CI, publicação e confirmação do cabeçalho no domínio com URL inédita. Cabeçalhos novos não removem respostas previamente armazenadas por intermediários. A poda temporal de assets com cache de build reutilizado e as etapas E5/E6 continuam abertas.
