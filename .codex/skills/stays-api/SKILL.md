---
name: stays-api
description: Operar a Stays External API, com foco no ciclo diário de anúncios, acomodações, conteúdo, fotos, calendário e tarifas; também consultar reservas e financeiro. Use o OpenAPI incluído para confirmar contratos e peça confirmação antes de alterações amplas.
metadata:
  short-description: Usar a Stays External API
---

# Stays API e operação de anúncios

Use esta skill principalmente para o dia a dia de anúncios na Stays: localizar, revisar, cadastrar, atualizar e preparar anúncios; conferir imóvel, cômodos, comodidades, fotos, status, calendário e tarifas. Também cobre reservas, financeiro, tarefas e comunicações pela API. Ela pode ser instalada em outros computadores; cada máquina deve configurar credenciais localmente.

## Roteamento por intenção

Comece por `references/intent-router.md` quando o pedido vier em linguagem natural. Para “subir”, “verificar” ou “atualizar” anúncio, siga [`references/listing-lifecycle.md`](references/listing-lifecycle.md). Use `references/stays-capabilities.md` para separar o que o produto/painel oferece do que o snapshot da External API realmente cobre.

## Referências incluídas

- Para entender a cobertura e escolher a área da API, consulte [`references/api-map.md`](references/api-map.md).
- Para localizar operações e resolver schemas de entrada/saída, consulte [`references/operation-workflow.md`](references/operation-workflow.md).
- Para consultas comuns de disponibilidade, preço e reservas, incluindo check-ins de hoje, consulte [`references/booking-operations.md`](references/booking-operations.md).
- Para padrões de chamadas, paginação e exemplos seguros, consulte [`references/request-patterns.md`](references/request-patterns.md).
- Para distinguir consultas, ações externas e escritas, consulte [`references/side-effects.md`](references/side-effects.md).
- Para autenticação, erros e diagnósticos, consulte [`references/troubleshooting.md`](references/troubleshooting.md).
- Para fazer cotações, administrar reservas e acompanhar hóspedes, consulte [`references/reservations-and-guests.md`](references/reservations-and-guests.md).
- Para cadastrar e manter imóveis, anúncios, cômodos e grupos, consulte [`references/listings-and-inventory.md`](references/listings-and-inventory.md).
- Para o fluxo ponta a ponta de cadastrar, revisar, atualizar e ativar anúncios, consulte [`references/listing-lifecycle.md`](references/listing-lifecycle.md).
- Para consultar ou alterar calendário, restrições e tarifas, consulte [`references/calendar-and-pricing.md`](references/calendar-and-pricing.md).
- Para interpretar razão do proprietário, transações e repasses, consulte [`references/finance-and-reconciliation.md`](references/finance-and-reconciliation.md).
- Para mensagens, e-mails, tarefas e avaliações, consulte [`references/communications-and-operations.md`](references/communications-and-operations.md).
- Para localizar rapidamente uma rota no contrato local, use `scripts/inspect-openapi.py "termos da busca"`.
- Para ver todas as operações com parâmetros, bodies, respostas e efeito provável, consulte [`references/endpoint-catalog.md`](references/endpoint-catalog.md). Regenere-o com `scripts/build-endpoint-catalog.py` se o snapshot mudar.
- Para atualizar a especificação local, consulte [`references/refresh-openapi.md`](references/refresh-openapi.md).
- O guia completo da API está em [`references/api-guide.md`](references/api-guide.md).
- O contrato OpenAPI completo está em [`references/stays-openapi.json`](references/stays-openapi.json) e acompanha esta skill para permitir instalação autocontida.
- Para instalar em outra máquina, siga [`README.md`](README.md). Configure credenciais a partir de `.env.example`; nunca compartilhe `.env`.
- Gere um pacote portátil com `scripts/export-skill.sh [caminho-do-zip]`. O exportador exclui `.env`, arquivos locais e metadados do macOS e verifica o conteúdo do ZIP.

## Regras essenciais

- Base URL padrão: `https://crcn.stays.net/external/v1` (`STAYS_BASE_URL`). Autenticação da API: HTTP Basic com `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET`.
- Credenciais da API são diferentes do login e senha do painel web. Nunca substitua client ID/secret por senha web ou cookies.
- A existência das variáveis no ambiente do processo não prova que o `.env` esteja vazio: sessões do Codex não carregam `.env` automaticamente. Verifique em silêncio o ambiente do processo e os arquivos locais de configuração do projeto ativo; carregue credenciais apenas no processo da chamada usando o loader do projeto ou a leitura segura descrita em `references/troubleshooting.md`.
- Leia credenciais do `.env` ou de um secret manager sem imprimir valores. Não registre segredos, cabeçalhos `Authorization`, cookies ou respostas com dados pessoais em logs, arquivos versionados, relatórios ou respostas ao usuário.
- Chamadas autenticadas devem ocorrer no backend via HTTPS. Reutilize cliente/proxy existente no projeto.
- Consulte o schema atual antes de qualquer chamada. Confira status HTTP e formato da resposta; não declare sucesso por mock, fallback ou resposta não validada.
- Para operar pela interface web da Stays, não deduza ações ou rótulos da API: use evidências da interface disponível. Esta skill documenta a External API e não substitui treinamento de UI específico da conta.
- Trate alterações na Stays como efeitos externos. Execute escrita somente com autorização clara para aquela operação e depois de validar conta, IDs, datas, valores e estado final. Antes de repetir uma chamada não idempotente, verifique se a primeira tentativa foi concluída.
- **Proibição absoluta de exclusão:** nunca exclua, desative, arquive, oculte, remova de canais ou solicite exclusão de anúncios, imóveis, acomodações, fotos, tarifas, reservas ou quaisquer outros registros da Stays. Isso vale para operações via API, painel, scripts e instruções a terceiros. Não interprete “ignorar”, “não incluir na análise”, “não usar” ou “esse não existe mais” como autorização para excluir ou alterar status. Em análises e tabelas, preserve todos os registros retornados pela fonte e sinalize separadamente qualquer pedido de filtro ou divergência de status. Se houver um pedido explícito de exclusão, não execute: informe que a skill proíbe exclusões e ofereça apenas consulta ou preparação de um relatório sem mudança de dados.
- Para mudança simples e bem especificada, confira o alvo e escopo antes de executar. Para criar/ativar anúncio, publicação em canal, alterações em vários anúncios, lote de fotos/tarifas, configurações globais ou exclusões, prepare primeiro um plano de mudanças e peça confirmação explícita sobre esse plano antes da escrita.
- Em relatórios, informe base de data, intervalo, filtros/status e limitações. Agregue ou minimize dados pessoais; diferencie valor da reserva, comissão, pagamentos e lançamentos do proprietário.

Ao concluir, informe os endpoints e critérios usados, validações realizadas e limitações relevantes, sem expor segredos ou PII desnecessária.
