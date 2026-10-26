# Atualizar o OpenAPI local

Atualize `references/stays-openapi.json` quando a conta publicar uma versão nova, quando um endpoint usado não existir no snapshot ou quando campos observados divergirem do contrato. Se estiver trabalhando no workspace CRCN, a fonte canônica também pode estar em `docs/stays-external-api/stays-openapi.json`.

## Procedimento

1. Acesse o Swagger autenticado da conta em `https://crcn.stays.net/external/v1/docs/` pelo fluxo de login autorizado. A sessão do painel pode ser necessária para carregar a documentação; cookies não devem ser copiados para chamadas da API.
2. Use a URL/especificação OpenAPI efetivamente carregada pela página, em vez de adivinhar caminhos JSON. Baixe a especificação como JSON sem gravar cookies ou cabeçalhos de sessão no arquivo.
3. Valide que o JSON parseia e contém `openapi`, `info`, `paths` e `components`; conte operações e schemas e compare com a versão anterior.
4. Revise alterações relevantes de métodos, parâmetros obrigatórios, schemas de request/response, códigos, segurança e marcações deprecated.
5. Atualize os resumos em `references/` se os recursos ou instruções operacionais mudarem. No workspace CRCN, atualize também `docs/stays-external-api/README.md` quando aplicável. Não edite `.env` durante a atualização do contrato.

## Limites

- Não use credenciais do painel para autenticar a API Basic; não exporte cookies.
- Se a sessão não autorizar o Swagger, não contorne o bloqueio: peça ao suporte da Stays a especificação ou a permissão adequada.
- Preserve o arquivo anterior até que o novo tenha sido validado. Informe a data/origem do snapshot e a contagem de operações após a atualização.
