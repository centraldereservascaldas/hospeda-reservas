# Padrões de requisição

## Autenticação

Base padrão: `https://crcn.stays.net/external/v1`. O serviço usa HTTP Basic com `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET`. O processo do Codex não recebe automaticamente as variáveis do `.env`; confira e carregue o arquivo local conforme [`troubleshooting.md`](troubleshooting.md).

Prefira cliente HTTP no backend que carregue `.env` internamente e faça Basic Auth em memória. Evite passar `client:secret` em argumentos de `curl`, pois argumentos podem aparecer em listas de processos.

Exemplo Python somente leitura com `python-dotenv` já disponível no projeto:

```python
import os
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv(Path("/caminho/para/o/projeto/.env"), override=False)
base = os.environ["STAYS_BASE_URL"].rstrip("/")
response = requests.get(
    f"{base}/booking/searchfilter",
    auth=(os.environ["STAYS_CLIENT_ID"], os.environ["STAYS_CLIENT_SECRET"]),
    headers={"Accept": "application/json"},
    timeout=30,
)
response.raise_for_status()
data = response.json()
```

Substitua o caminho pelo arquivo de configuração local autorizado do projeto. Não imprima `os.environ`, `response.request.headers` ou respostas integrais com PII. Se `python-dotenv` não existir, use o loader já adotado pelo projeto; não instale uma dependência só para um teste pontual. Não use shell tracing (`set -x`) nem autenticação do navegador.

## JSON

Para endpoints com body JSON, envie `Accept: application/json` e `Content-Type: application/json`. Monte o body somente após conferir o schema específico da operação. Não reutilize um body de rota parecida sem validação.

Padrão ilustrativo para uma operação POST de leitura (o endpoint e o payload reais dependem da tarefa e do OpenAPI):

```python
payload = {...}  # montar somente após validar o schema OpenAPI
response = requests.post(
    f"{base}/booking/search-listings",
    auth=(os.environ["STAYS_CLIENT_ID"], os.environ["STAYS_CLIENT_SECRET"]),
    headers={"Accept": "application/json", "Content-Type": "application/json"},
    json=payload,
    timeout=30,
)
response.raise_for_status()
data = response.json()
```

Esse bloco pressupõe que os imports, `base` e a configuração do exemplo GET já foram feitos. Confirme nomes, tipos e obrigatoriedade no OpenAPI antes de executar. Um POST pode ser somente leitura ou mutação; decida pela finalidade da operação.

## Paginação e filtros

Leia o schema da rota e percorra páginas até a condição documentada indicar fim. Preserve filtros entre páginas e deduplique apenas por identificador estável, se o contrato permitir. Informe o intervalo consultado e quaisquer limites aplicados localmente.

## Tratamento de resposta

Confira status HTTP antes de interpretar o body; valide tipo de mídia e estrutura contra o schema. Armazene apenas o necessário, redija PII e nunca trate um fallback/mock como resposta Stays. Para binários, siga o tipo de mídia e o mecanismo documentado, sem despejar bytes em logs.
