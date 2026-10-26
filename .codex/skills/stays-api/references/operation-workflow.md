# Descobrir operação, campos e resposta

Siga este procedimento para qualquer rota, não apenas Booking.

1. Abra `references/stays-openapi.json` e encontre `paths["/caminho"]` (dentro do diretório instalado da skill, o arquivo fica em `references/stays-openapi.json`).
2. Selecione o método HTTP (`get`, `post`, `put`, `patch` ou `delete`). Leia `summary`, `description`, `tags`, `parameters`, `requestBody`, `responses` e `security`.
3. Combine os parâmetros definidos na operação com os parâmetros no nível do path. Para cada parâmetro, confira `in` (`path`, `query`, `header` ou `cookie`), `required`, `schema`, `description`, limites e enums.
4. Para referências `$ref`, resolva o ponteiro JSON a partir da raiz do documento, normalmente em `components/schemas/...`, `components/parameters/...`, `components/requestBodies/...` ou `components/responses/...`. Siga referências aninhadas até entender o payload completo.
5. Para `requestBody`, confira o tipo de mídia (normalmente `application/json`) e schema. Campos em `required` são obrigatórios; `additionalProperties: false` proíbe campos adicionais quando presente.
6. Leia cada resposta por código HTTP e tipo de mídia. Diferencie sucesso, erro e `204` sem corpo. Não deduza um body de resposta quando o schema está vazio ou ausente.
7. Verifique paginação, limites e filtros na própria operação. Não assuma que nomes como `page`, `limit`, `skip` ou filtros têm comportamento uniforme em todos os endpoints.
8. Antes de executar, classifique a chamada pelo efeito: leitura, ação externa (por exemplo enviar mensagem/e-mail/notificação) ou mutação de dados. Use `references/side-effects.md`.

## Relatar o contrato

Ao explicar uma operação, informe:

- método e caminho completos (base URL mais path);
- finalidade e classificação de efeito;
- entradas obrigatórias e opcionais com tipos e formatos relevantes;
- formato da resposta e códigos esperados;
- paginação, limites, permissões ou lacunas do schema;
- se a resposta foi documentada, observada ao vivo ou inferida.

Não apresente exemplos antigos ou do site público como contrato da conta quando o OpenAPI local divergir. Se a operação não estiver no snapshot ou estiver incompleta, confirme pelo Swagger autenticado da conta ou fonte oficial; declare a incerteza se não puder confirmar.
