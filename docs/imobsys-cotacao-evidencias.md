# Conferência de cotação da ImobSys

Consulta somente de leitura em 26/11/2026, sem criar reserva ou pagamento. As informações abaixo são uma amostra, não uma regra geral de todas as unidades.

Para Aquarius Residence A0404, referência da rede 1529, de 28/12/2026 a 02/01/2027, o painel Orçamentos + Rede exibiu Pix de R$ 3.523,00 e capacidade de até 6 pessoas, mais uma criança de até 5 anos. A página pública da mesma unidade e período exibiu Pix de R$ 3.522,00; sua descrição mencionou até 7 pessoas, mais uma criança menor de 5 anos. A página também informou taxa de pulseira de R$ 10,00 por pessoa, paga em dinheiro ao condomínio.

Fonte pública observada: https://reservascrcn.com.br/parceiro/1/1529?28-12-2026,02-01-2027,CALDASIN. Valores, condições e conteúdo podem mudar.

Conclusões para a integração:

- A diferença de R$ 1,00 exige verificar atualização, arredondamento e fonte oficial antes de escolher um valor a cobrar; não é prova de qual dos dois preços está correto.
- A divergência de capacidade exige confirmação do fornecedor. O filtro de pessoas do painel não comprova, por si só, que o preço foi calculado por ocupação.
- A taxa local é separada do valor anunciado e deve ser comunicada com precisão, após confirmação de aplicação e forma de pagamento. Não deve ser adicionada automaticamente à cobrança da CRCN sem uma regra confirmada.
- A resposta `/v1/offers` atualmente expõe `guestCountVerified: false` e `additionalChargesKnown: false`. O checkout precisa continuar impedindo cobranças enquanto esses dados não forem confirmados por uma fonte confiável.
- A reserva é criada depois da cobrança, por decisão do fluxo; a oferta observada não bloqueia estoque. Caso a criação falhe ou fique incerta após pagamento confirmado, encaminhar imediatamente para atendimento e tratamento financeiro, sem criar outra cobrança ou outra reserva automaticamente.

## Consulta de leitura no servidor

Em 26/11/2026, o serviço isolado no Coolify informou conexão presente e a consulta interna autenticada de 17 a 19/05/2027 para 2 hóspedes respondeu com ofertas observadas. Na primeira amostra, unidade `imobsys-crcn-2-663`, o painel retornou R$ 523,00 e capacidade informada de 5; o contexto público para a mesma referência e período também retornou R$ 523,00. A consulta foi somente de leitura, sem reserva ou cobrança.

Essa coincidência de uma amostra comprova o acesso e a comparação de valores nessa consulta, não a disponibilidade garantida nem a composição de taxas e hóspedes: a resposta continua com os indicadores de disponibilidade, hóspedes e encargos não confirmados. O campo público `BaseConsulta` retornou `tt` apesar de a base da consulta ser `2`; não se deve inferir que sejam identificadores intercambiáveis. A verificação de unidade e datas após criar uma pré-reserva permanece pendente.

Em consulta posterior, a página pública da reserva de teste já cancelada retornou HTML de cancelamento. Os campos estruturais encontrados não forneceram período nem identidade da unidade utilizáveis para comprovar a reserva; o campo oculto de unidade continha apenas `0`. O histórico persistente da API mais recente também não tinha registros das duas reservas de teste anteriores. Portanto esses registros antigos não fornecem evidência suficiente para habilitar a confirmação automática; nenhuma reserva foi criada ou modificada nessa verificação.

Uma consulta posterior, também somente de leitura, examinou um contrato existente com acesso já autorizado. A página retornou uma ocorrência de “Data de Entrada” e uma de “Data de Saída”, com datas escritas por extenso, além da referência de aluguel e do valor. Não foi encontrado link para o imóvel nem marcador explícito de identificador da unidade; existe um campo oculto chamado `unidade`, mas sua semântica e associação com o identificador composto da oferta não estão comprovadas. Esta observação mostra que as datas podem estar presentes em alguns contratos, mas não prova que a unidade e as datas correspondam a uma operação criada pela API. Nenhum dado do hóspede foi registrado nesta evidência. Não altera os indicadores de confirmação nem autoriza cobranças ou reservas.

Uma tentativa de correlacionar automaticamente esse contrato com uma busca autenticada posterior, em outro período, comparou os nomes normalizados de condomínio e unidade em 86 ofertas observadas. Nenhuma correspondência textual exata foi encontrada. Essa ausência não prova que o imóvel não esteja no catálogo, pois a unidade pode não ter sido oferecida naquele período ou os nomes podem diferir entre telas. O cruzamento por nome não substitui um identificador comprovado.

## Associação recuperada do teste anterior

Os registros cronológicos desta conversa mostram que o teste autorizado abriu a oferta pública `/parceiro/2/663` para 17 a 19/05/2027, acessou o formulário dessa oferta e solicitou a pré-reserva; em seguida, o atendimento identificou o resultado como pré-reserva 1602, no Lacqua diRoma. O painel posteriormente mostrou a 1602 cancelada e sem pagamento. O teste ocorreu antes da restrição atual que proíbe novas reservas reais; esta conferência apenas leu os registros antigos.

O registro original da resposta foi recuperado posteriormente: ele mostra a referência 1602 e o link do contrato, o mesmo título exato da oferta, as datas de 17 a 19/05/2027 e o valor de R$ 523,00. A tela imediatamente anterior ao envio estava na oferta `/parceiro/2/663`. Isso fornece evidência histórica de associação para esse caso, mas a resposta recuperada não mostra a referência numérica da unidade. O contrato da 1602 agora está cancelado e a operação antiga não consta no banco atual da API. O exemplo não comprova composição de hóspedes, encargos ou que títulos sejam únicos em todo o catálogo. As proteções de pagamento e de confirmação continuam ativas; não repetir nem alterar a reserva para esta conferência.

Na sequência, foi recuperado também o registro da tela administrativa da hospedagem 1602: o título identificava a mesma hospedagem, os campos de entrada e saída mostravam 17/05/2027 e 19/05/2027, e havia um único link visível para `https://reservascrcn.com.br/parceiro/2/663`. Esta evidência associa, nesse exemplo específico, a hospedagem à referência de base e unidade da oferta sem depender do título. A tela registrada é uma árvore de acessibilidade, não o HTML ou DOM original; ainda é necessário validar seletores estáveis de leitura e interpretar estados de pré-reserva ativa no executor antes de usar isso como confirmação automática. O registro não foi alterado e nenhum dado do hóspede foi incluído nesta documentação.
