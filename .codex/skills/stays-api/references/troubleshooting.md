# Autenticação e diagnóstico

## Segredos

As credenciais Basic da External API são `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET`; login/senha do painel web e cookies de navegador não são substitutos. Guarde segredos em `.env` local ignorado pelo Git ou em secret manager. Verifique presença sem imprimir valores e evite `set -x`, dumps de ambiente e logs de headers.

Se a credencial foi compartilhada ou registrada acidentalmente, recomende rotação com a Stays e atualize o secret store. Não inclua o valor anterior em diagnóstico.

## `.env` não carregado na sessão

Uma chamada Python/Node/shell iniciada pelo Codex não herda automaticamente as variáveis do `.env`. Quando uma chamada falhar por credenciais ausentes:

1. Confirme se as três chaves estão no ambiente atual; imprima apenas presença/ausência, nunca valores. A ausência no ambiente atual não significa que o `.env` esteja ausente.
2. Se faltarem, procure o arquivo de configuração local indicado pelo projeto ativo. Para instalação avulsa desta skill, use o `.env` criado localmente a partir de `.env.example`; não presuma que o diretório atual seja o projeto correto. Não mostre o arquivo com `cat`, `env`, `printenv` nem `set -x`.
3. Carregue o arquivo somente dentro do processo que fará a chamada, usando dotenv já disponível no projeto. Se não houver loader, leia linhas `KEY=VALUE` por um parser local apropriado; mantenha valores em memória e não os passe como texto literal ao comando, argumentos, logs ou saída da ferramenta.
4. Valide que `STAYS_BASE_URL`, `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` estão não vazias e use HTTP Basic em memória. Um exemplo seguro não deve imprimir o header nem os valores.
5. Só peça configuração ao usuário depois de confirmar que o arquivo local correto e o secret manager não contêm as chaves.

Não altere o `.env` para fazer uma leitura. Para consultas, carregar a configuração local existente é suficiente.

## Códigos HTTP

- `2xx`: transporte aceito; ainda valide body e estado semântico. `204` não tem body.
- `400`/`422`: entrada inválida ou incompatível; compare nomes, tipos, `required`, formatos e enums com o schema. Não faça retry sem corrigir a causa.
- `401`: autenticação ausente/inválida, credencial da API incorreta ou esquema Basic inadequado.
- `403`: identidade reconhecida, mas rota/ação não autorizada, ou bloqueio no gateway; um 403 na página Swagger não prova que toda a API esteja indisponível.
- `404`: base/path incorreto ou recurso inexistente. Confirme versão e caminho exatos.
- `409`: conflito com estado atual, se documentado para aquela operação.
- `429`: limite de taxa; siga `Retry-After` se retornado e use espera progressiva apenas para chamadas seguras/idempotentes.
- `5xx`/timeout: falha transitória possível; para escrita, verifique o estado antes de tentar novamente.

Os códigos variam por endpoint. Prefira as respostas da operação no OpenAPI e o body de erro real, removendo dados pessoais e credenciais dos logs.

## Diagnóstico em ordem

1. Confirme que `STAYS_BASE_URL`, `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` estão definidas, sem exibir seus valores.
2. Verifique host e prefixo `/external/v1` para evitar duplicar ou omitir o caminho base.
3. Faça uma consulta GET pequena e documentada, se o usuário pediu validar acesso.
4. Registre endpoint, status, duração e código de erro sanitizados; nunca registre Authorization/cookie ou body com PII.
5. Se a rota de docs der 403, verifique o endpoint de dados e a sessão do Swagger separadamente; encaminhe ao suporte se a autorização continuar negada.
