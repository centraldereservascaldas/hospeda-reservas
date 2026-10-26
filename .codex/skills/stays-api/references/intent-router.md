# Roteador de pedidos em linguagem natural

Use esta referência primeiro quando a pessoa pedir algo de forma cotidiana. Priorize o ciclo diário de anúncios e acomodações. Interprete intenção e escopo, selecione um fluxo read-only por padrão e só pergunte o dado que impede uma consulta correta. Se a operação for escrita ou comunicação externa, obtenha autorização explícita para aquela ação concreta antes da chamada.

## Rota principal: anúncios e acomodações

| Pedido típico | O que a pessoa provavelmente quer | Rota inicial | Pergunta mínima / resultado |
|---|---|---|---|
| “subir anúncio”, “cadastrar acomodação”, “criar um flat” | Criar propriedade/condomínio e/ou listing da unidade; às vezes quer publicar | `GET /content/properties`, `GET /content/listings`, vocabulários `/translation/*`; depois `POST /content/properties` e/ou `POST /content/listings` | Pergunte se propriedade/endereço já existe, se é uma unidade dentro de propriedade ou anúncio independente, nome interno e dados ausentes. Prepare rascunho de campos; ativação/publicação exige confirmação após mostrar o plano. |
| “verificar anúncio”, “está completo?”, “por que não aparece?” | Auditoria de cadastro, status, fotos, quarto, configuração e calendário | `GET /content/listings/{listingId}`, propriedade relacionada, `/content/listing-rooms/{listingId}`, `/settings/listing/{listingId}/*`, calendário | Resolva o listing correto. Retorne checklist aprovado/ausente/não verificável. Channel mapping/publicação OTA não é comprovado só pelo listing status. |
| “atualizar anúncio”, “corrigir descrição/endereço/amenities” | Atualizar campos de listing, property, room ou configuração | `GET` do recurso antes; depois `PATCH` na entidade correspondente | Pergunte qual unidade se houver homônimos e qual dado deve ser atualizado. Preserve campos não solicitados; releia após salvar. Alterações em massa exigem plano+confirmação. |
| “subir fotos”, “trocar fotos”, “arrumar imagens” | Enviar mídia e associar à property/listing/room | `POST /content/upload-images`, depois `PATCH` no recurso cuja imagem precisa ser associada | Confirme anúncio/cômodo e quais arquivos/fotos vão entrar ou sair. Mostre o resultado e não remova fotos antigas sem instrução explícita. |
| “ativar anúncio”, “publicar”, “deixar visível” | Mudar status/visibilidade e possivelmente distribuir para canais | Primeiro audite status, calendário, tarifas e cadastro; use `PATCH /content/listings/{listingId}` se o schema cobrir a mudança | “Ativo”, “oculto” e “rascunho” têm efeitos diferentes. Mostre canais e impacto que consegue confirmar e peça confirmação explícita antes de ativar/publicar. |
| “atualizar calendário”, “fechar datas”, “mudar diária” | Consultar/alterar disponibilidade, preço ou restrição | `GET /calendar/listing/{listingId}?from&to`; PATCH `/prices`, `/restrictions` ou `/batch` | Confirme unidade, intervalo, preço/restrição e timezone. Lote ou múltiplas unidades exige plano+confirmação. |

Siga o procedimento completo em `listing-lifecycle.md`; não crie cadastro quando a pessoa pediu apenas uma auditoria ou orientação.

## Rota secundária: “financeiro da Stays”

“Quero ver o financeiro da Stays” é ambíguo. Não dispare várias consultas de áreas diferentes nem escolha um total arbitrariamente. Faça uma pergunta curta com opções e período:

> Você quer ver (1) saldo/lançamentos de proprietários, (2) transações e fluxo financeiro da administradora, (3) pagamentos ou valores das reservas, ou (4) repasses de Airbnb/Booking? Para qual período?

Então use a rota correspondente:

| O usuário quer… | Dados que faltam | Primeira rota | Próxima etapa e forma de apresentar |
|---|---|---|---|
| “quanto devo ao proprietário?”, “extrato do dono”, “saldo dos proprietários” | Período; proprietário/anúncio se não for geral | `GET /finance/owners?from&to` | Resolva proprietário/anúncio nos IDs retornados e leia `GET /finance/owners/{ownerId}` ou `/{ownerId}/{listingId}?from&to`. Mostre crédito, débito, saldo, período e status de cada lançamento relevante. Não exponha IDs/notas internas sem necessidade. |
| “contas/receitas/despesas”, “fluxo financeiro da empresa”, “transações” | Período e base de data (`creation`, `payment`, `expiration`, `competence`); escopo opcional (crédito/débito, anúncio, proprietário, conta, categoria) | `GET /finance/accounting-transactions?from&to&dateType` | Paginar com `skip`/`limit` e respeitar limite do snapshot (100). Classificar por tipo e status reais; não chamar de caixa recebido sem confirmar pagamento/liquidação. |
| “valor das reservas”, “comissão do período”, “quanto vendemos” | Período e coorte: criação, check-in, checkout ou incluídas | `POST /booking/reservations-export` com `dateType` | Defina status, por exemplo `booked` separado de `reserved`/cancelado; calcule somente o campo apropriado e declare fórmula. Para recebimentos, use pagamentos/transações correspondentes, não `reserveTotal` como substituto. |
| “repasse do Airbnb/Booking”, “repasses pendentes/pagos” | Canal, período e data esperada/paga/referência | `GET /finance/ota-payouts` | Use `dateType`, `channel`, `status`, `from` e `to`; leia `items`, moeda, `grossAmount`, `netAmount` e taxas sem somar campos que se sobreponham. Período máximo de um ano no contrato atual. |
| “contas a pagar/receber” ou “relatório/balancete” | Tipo de relatório, período, base de data | Consultar `/finance/accounting-transactions` se o objetivo couber no schema | A Central de Ajuda documenta relatórios de contas a pagar/receber, balancete e relatório de proprietários na UI. Se o endpoint não reproduzir filtros/colunas/status pedidos, explique o limite e direcione para o relatório do painel em vez de afirmar equivalência. |

Se a pessoa disser apenas “financeiro”, não interprete isso como saldo bancário da CRCN, lucro, comissão ou repasse. Desambigue. Se responder “tudo”, apresente as quatro visões separadamente, com períodos e bases de data explícitos.

## Outras frases comuns

| Pedido típico | Interpretação | Fluxo |
|---|---|---|
| “quem chega hoje?”, “lista de check-ins” | Reservas com check-in em data local | `booking-operations.md`: obtenha data/timezone, consulte reservations/export com `dateType=arrival`, valide checkInDate e status. |
| “tem vaga em…?”, “quais apartamentos estão livres?” | Disponibilidade | `GET/POST /booking/search-listings`; confirme parâmetros no método escolhido. Se pedirem valor, complemente com `calculate-price`. |
| “quanto custa o flat X neste período?” | Cotação específica | Resolver listingId; `GET/POST /booking/calculate-price`; informar moeda/itens da resposta, não garantir bloqueio. |
| “ache a reserva do cliente X” | Busca de reserva/cliente | Pergunte período ou dado suficiente; use lista/export e detalhe. Proteja PII e evite consulta ampla. |
| “bloqueie o apartamento”, “feche estas datas” | Bloqueio do calendário | Determine listing, intervalo, motivo e se a ação é bloqueio/maintenance; ver `calendar-and-pricing.md`. É escrita, exige autorização explícita. |
| “mude a diária / mínimo de noites” | Preço ou restrição | Identifique modelo de precificação e escopo; leia calendário/configuração antes. A confirmação deve listar datas e valores. |
| “mande mensagem para o hóspede/proprietário” | Comunicação externa | Localize thread/booking, confirme destinatário e texto final. POST de mensagem/e-mail não é leitura. |
| “como faço isso no painel da Stays?” | Orientação de UI | Consulte `stays-capabilities.md` e a fonte oficial da Stays Academy; deixe claro quando a orientação varia por plano/permissão. Não invente rótulos de tela. |

## Perguntas mínimas por tipo

- Financeiro: “qual visão?” e período; pergunte base de data quando afetar a resposta.
- Reserva: identificador ou hóspede + período; não peça CPF/e-mail se reserva e datas bastarem.
- Disponibilidade: entrada, saída, número de hóspedes; condomínio ou preferência somente se o usuário mencionou.
- Calendário/tarifa: anúncio exato, intervalo, valor/restrição e timezone se houver ambiguidade.
- Mensagem: destinatário, canal e conteúdo; mostre o conteúdo final antes de enviar quando ainda não tiver sido especificado.
