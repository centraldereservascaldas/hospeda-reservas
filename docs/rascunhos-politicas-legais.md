# Rascunhos de privacidade e cancelamento

> **Rascunho interno para revisão. Não publicado e ainda não aprovado.** Os trechos entre colchetes são pendências que precisam ser preenchidas com informações verificadas. Este documento não afirma que a operação esteja em conformidade integral com a LGPD ou com o CDC.

Este material foi preparado a partir do código existente em 26/10/2026 e de fontes oficiais indicadas ao final. A publicação depende de confirmar a identidade da empresa responsável, os canais de atendimento, os papéis dos anfitriões e fornecedores, os prazos de retenção, as regras de cada oferta e a revisão jurídica.

## Política de privacidade — rascunho para hóspedes

**Última atualização:** [preencher após aprovação]  
**Responsável pelo tratamento:** [razão social e nome fantasia]  
**CNPJ informado pelo responsável:** 67.314.679/0001-64 *(informado pelo responsável; não verificado em cadastro público)*  
**Canal de privacidade e atendimento:** [e-mail, formulário ou endereço confirmado]

### 1. Sobre esta política

Esta política explica como tratamos dados pessoais quando você navega pelo site, pesquisa acomodações, conversa com a assistente Sofia, cria ou acessa uma conta, solicita ou realiza uma reserva, efetua pagamento ou entra em contato conosco.

O tratamento depende da funcionalidade utilizada. Uma reserva pode envolver a Central de Reservas Caldas Novas, o anfitrião ou responsável pela acomodação e fornecedores que viabilizam autenticação, hospedagem da reserva, pagamento, comunicação ou medição. Os papéis de cada participante e seus contatos devem ser confirmados antes da publicação.

### 2. Dados que podemos tratar

De acordo com a jornada utilizada, podemos tratar:

- **Conta e identificação:** nome, e-mail, identificadores de conta e dados necessários para autenticar você.
- **Pesquisa e hospedagem:** acomodação escolhida, datas de entrada e saída, quantidades de adultos, crianças, bebês e animais, cotações, disponibilidade, reserva e histórico de atendimento relacionado.
- **Contato e reserva direta:** nome completo, e-mail, telefone, dados do pedido, condições comerciais aceitas e eventos necessários para acompanhar a reserva.
- **Pagamento:** modalidade escolhida, identificadores e situação da transação, valor, moeda e informações de conciliação. Os dados do cartão ou outros dados de pagamento podem ser coletados diretamente pelo provedor de pagamento; confirme o fluxo e os campos efetivamente recebidos pela plataforma antes da publicação.
- **Assistente Sofia:** mensagens enviadas por você e contexto da conversa necessário para responder. Quando a resposta é gerada pela integração de inteligência artificial, a mensagem e o histórico enviado podem ser processados pelo fornecedor dessa tecnologia. Evite compartilhar dados sensíveis ou informações que não sejam necessárias.
- **Medição e publicidade, se autorizadas:** preferências de medição, eventos de navegação e funil, identificadores de acomodação, dados técnicos e parâmetros de campanha como origem, mídia, campanha e identificadores de clique. O site guarda preferências e atribuição no armazenamento local do navegador; ferramentas de terceiros podem usar tecnologias próprias quando ativadas.
- **Registros técnicos e segurança:** informações necessárias para manter o serviço, prevenir fraude, proteger contas, diagnosticar falhas e demonstrar operações. Os registros concretos, a finalidade e os prazos precisam ser inventariados e confirmados.

Não solicitamos que você envie dados pessoais de outros hóspedes pelo chat da Sofia. Informe apenas os dados necessários para a reserva e para a hospedagem.

### 3. Para que usamos os dados

Usamos os dados, conforme o caso, para:

- apresentar acomodações, pesquisar datas, conferir disponibilidade e calcular preços;
- criar e administrar a conta, identificar o titular e mostrar reservas vinculadas a ela;
- processar pedidos de reserva, comunicar condições da oferta, enviar confirmações e acompanhar pagamento, reserva, cancelamento e reembolso;
- encaminhar à Stays os dados necessários para localizar ou administrar cadastro e reserva, quando essa integração for usada;
- encaminhar ao provedor de pagamento os dados necessários para iniciar, verificar e conciliar uma transação;
- responder dúvidas pela Sofia e prestar atendimento;
- medir o uso do site e campanhas somente conforme as preferências registradas para as categorias correspondentes;
- cumprir obrigações legais e regulatórias, proteger direitos, prevenir fraude e manter a segurança do serviço.

As bases legais variam conforme a finalidade e a etapa da jornada. A execução de contrato ou de procedimentos preliminares, o cumprimento de obrigação legal, o exercício regular de direitos, o legítimo interesse após avaliação pertinente e o consentimento podem ser aplicáveis em situações diferentes. **Não baseamos todos os tratamentos em consentimento.** O consentimento de medição e publicidade é uma escolha separada das etapas necessárias para pesquisar ou solicitar uma reserva.

### 4. Compartilhamento e fornecedores

Podemos compartilhar os dados estritamente necessários com:

- **Stays**, para consultar acomodações e disponibilidade e, quando aplicável, localizar cadastros, sincronizar dados de hóspedes e administrar reservas;
- **Mercado Pago**, quando a integração de pagamento estiver habilitada, para processar ou acompanhar transações;
- **Supabase**, para autenticação e, conforme a arquitetura vigente, associação de perfil à conta;
- **OpenAI**, quando a Sofia utilizar resposta gerada por inteligência artificial;
- **Google Tag Manager e tags nele configuradas**, se as preferências de medição e publicidade estiverem habilitadas;
- anfitrião ou operador responsável pela acomodação, quando seja necessário para executar a hospedagem ou atender uma solicitação;
- autoridades públicas, profissionais e prestadores, nas hipóteses necessárias para cumprir a lei, proteger direitos ou operar o serviço com salvaguardas adequadas.

A lista de fornecedores, os dados que cada um recebe, seus papéis, países de processamento e salvaguardas para transferências internacionais precisam ser confirmados antes da publicação. Cada fornecedor pode ter política própria para o tratamento sob sua responsabilidade.

### 5. Preferências de medição

O site oferece o controle **“Preferências de medição”**, com escolhas separadas para analytics (medição de uso) e publicidade. As escolhas ficam guardadas no navegador, podem ser alteradas depois e podem ser recusadas em conjunto. Algumas ferramentas podem depender da combinação das duas escolhas: no comportamento atual, o Google Tag Manager e os eventos analíticos do funil só são carregados ou enviados quando ambas estão habilitadas. Isso não significa que as tags estejam configuradas para operar de forma independente por categoria. Ao revogar uma escolha depois do carregamento das tags, o site recarrega a página; a remoção de cookies já criados depende da configuração das ferramentas.

No código local, quando ambas as categorias foram autorizadas e o ID do GTM é válido, o site enfileira os comandos Google Consent Mode `consent/default` (categorias negadas) e `consent/update` (escolhas autorizadas) antes de iniciar o GTM. Na recusa inicial ou com configuração inválida, o código não cria essa fila nem carrega o script. Essa implementação local não confirma o comportamento das tags no container publicado, o uso de cookies nem as requisições efetivamente enviadas; isso ainda precisa ser conferido no GTM/Tag Assistant e nas ferramentas configuradas antes de aprovar os textos ou publicar.

Você pode alterar suas escolhas pelo controle de preferências disponível no site. A recusa dessas categorias não deve impedir as funções necessárias para navegar ou solicitar uma reserva. [Confirmar quais tags estão configuradas no GTM e se a configuração publicada de cada tag respeita a escolha registrada antes da publicação.]

### 6. Armazenamento e retenção

Mantemos os dados pelo tempo necessário para as finalidades descritas e conforme obrigações legais, regulatórias, contratuais e de defesa de direitos. Os períodos concretos por categoria de dado, os critérios de eliminação ou anonimização, a retenção de backups e os registros de pagamento precisam ser definidos e confirmados pelo responsável. Não inserir um prazo estimado sem validação.

### 7. Seus direitos e como exercê-los

Você pode solicitar, conforme as condições previstas na LGPD, confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, portabilidade quando aplicável, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade, eliminação de dados tratados com consentimento quando cabível, informação sobre a possibilidade e as consequências de não consentir e revogação do consentimento. Também pode apresentar oposição nas hipóteses legais.

Envie sua solicitação para **[canal de privacidade confirmado]**, informando como podemos localizar os dados e qual direito deseja exercer. Poderemos pedir informações razoáveis para confirmar sua identidade e proteger sua conta. Alguns dados podem precisar ser mantidos quando houver obrigação legal ou outra hipótese legal aplicável; explicaremos a razão quando isso ocorrer. Se não formos responsáveis por determinado tratamento, indicaremos, quando possível, o agente apropriado.

### 8. Segurança e atualizações

Adotamos medidas técnicas e organizacionais compatíveis com a operação para proteger dados pessoais. Nenhum serviço pode prometer segurança absoluta. Se alterarmos esta política, atualizaremos a data indicada no início e informaremos mudanças relevantes pelo próprio serviço ou por outro canal adequado.

## Cancelamento e reembolso — rascunho para hóspedes

**Última atualização:** [preencher após aprovação]  
**Central responsável:** [razão social e canal confirmado]; CNPJ informado pelo responsável: **67.314.679/0001-64** *(não verificado em cadastro público)*.  
**Aplicação:** pedidos feitos no site e reservas administradas pela Central, respeitadas as condições específicas exibidas para cada acomodação e os direitos previstos em lei.

### 1. Confira as condições da sua reserva

Antes de concluir uma reserva, confira as datas, o número de hóspedes, o preço total e as condições de cancelamento e reembolso exibidas para aquela acomodação. A política aplicável pode variar conforme o imóvel, as datas e as condições específicas da oferta. Guarde a confirmação e as condições apresentadas no momento da compra.

As regras específicas da oferta serão informadas antes da conclusão e integrarão o registro da reserva. **Não publicaremos percentuais, prazos, multas ou janelas de cancelamento genéricos enquanto essas condições não estiverem aprovadas para cada oferta.** Nenhuma condição específica reduz direitos que a legislação assegure ao consumidor.

### 2. Como pedir cancelamento

Para pedir o cancelamento conforme as condições da sua reserva, use **[ferramenta online de cancelamento a implementar e confirmar]** ou, se preferir, fale com a Central em **[canal confirmado]**. Informe o código da reserva e o e-mail usado na contratação. Não envie dados completos do cartão, senha ou código de autenticação. A ferramenta usada para contratar deve permitir o envio e acompanhamento de pedidos de cancelamento; os demais canais são alternativas, não uma exigência para você usar um canal externo.

Para cancelamentos sujeitos às condições comerciais da oferta, o envio do pedido inicia a análise e não confirma, por si só, o cancelamento nem o reembolso. A reserva permanece ativa até a confirmação do cancelamento. A Central verificará as condições específicas apresentadas na compra e informará o resultado por **[canal de retorno a confirmar]**. Essa análise comercial não se aplica para restringir ou atrasar um direito legal de arrependimento ou outro direito legal que seja aplicável ao seu caso.

Para reservas administradas na Stays, o sistema encaminha a solicitação à plataforma de reservas e só considera o cancelamento confirmado quando recebe a confirmação correspondente. Se não for possível confirmar a alteração, a reserva pode continuar ativa; procure a Central pelo canal indicado.

### 3. Análise do valor a devolver

Se houver valor a devolver, a Central informará o montante e iniciará o procedimento aplicável junto ao meio de pagamento. O resultado e o prazo de crédito podem depender da forma de pagamento, do provedor e do emissor do cartão. **O prazo operacional de cada meio de pagamento ainda deve ser confirmado e não está definido neste rascunho.**

O valor devido será avaliado à luz das condições da oferta e dos direitos legais aplicáveis ao caso. Esta política não promete reembolso integral em qualquer hipótese nem exclui valores ou direitos que sejam devidos por lei. Se o cancelamento partir da Central ou do responsável pela acomodação, a Central comunicará as alternativas e providências cabíveis conforme a legislação e a reserva.

### 4. Direito de arrependimento e outros direitos legais

Nas contratações fora do estabelecimento comercial, o artigo 49 do Código de Defesa do Consumidor prevê o direito de arrependimento no prazo legal de sete dias, observadas as condições legais, e a devolução dos valores pagos quando o direito é exercido. Para manifestar o arrependimento em uma contratação eletrônica, use a mesma ferramenta online utilizada para contratar; você também pode escolher outro meio de atendimento disponibilizado. Não é necessário usar exclusivamente telefone, e-mail ou outro canal externo. A Central confirmará imediatamente o recebimento da manifestação pelo mesmo meio e comunicará imediatamente o provedor financeiro ou administrador do cartão para impedir o lançamento ou efetivar o estorno, conforme o estado da transação. Este fluxo de arrependimento não depende da análise de uma política comercial de cancelamento. Nenhuma regra desta página pretende afastar direito assegurado ao consumidor.

### 5. Ajuda com um pedido

Se você já enviou uma solicitação, acompanhe o estado em **[caminho de conta a confirmar]** ou contate **[canal oficial confirmado]**, informando o código da reserva. A confirmação de recebimento do pedido não significa, por si só, que a reserva foi cancelada ou que o reembolso foi processado.

## Fatos observados no sistema

Estes fatos justificam o conteúdo do rascunho, mas não substituem um inventário completo de dados nem uma análise jurídica:

- O checkout direto valida e registra nome completo, e-mail, telefone, datas, composição do grupo, imóvel, preço cotado, versão e cópia das condições aceitas, além de parâmetros de atribuição de campanhas quando enviados. A rota de checkout direto está atualmente descrita no `README.md` como ainda não habilitada para compra real e dependente de condições comerciais aprovadas.
- A conta usa Supabase Auth. O backend mantém um perfil de hóspede e identificador de cliente da Stays; a sessão verifica a identidade via Supabase.
- Stays é consultada para catálogo, cotação, disponibilidade e, conforme o caminho usado, cadastros ou reservas.
- O Mercado Pago está integrado no código para iniciar e conciliar pagamentos, mas o estado documentado do produto indica que o fluxo não foi validado ponta a ponta nem habilitado para compra real.
- A Sofia pode enviar a mensagem e o histórico recente à API OpenAI. O endpoint observado usa `store: false`; isso não basta para afirmar políticas de retenção ou processamento do fornecedor.
- Preferências e atribuição de campanha ficam no armazenamento local do navegador. Analytics e publicidade têm escolhas independentes; os eventos de funil e o carregamento do GTM ainda exigem ambas autorizadas, e essa combinação não comprova que as tags estejam configuradas para operar separadamente por categoria.
- No pedido de reserva direta, a interface e a API registram pedido de cancelamento para análise; o retorno informa que a reserva continua ativa até confirmação. O reembolso não é iniciado por essa solicitação. O fluxo administrativo possui passos para verificar cancelamento na Stays e reembolso no gateway.
- Para reservas sincronizadas na Stays, o sistema envia uma alteração de cancelamento ao serviço e retorna sucesso apenas se a Stays confirmar; em caso de falha, informa que a reserva continua ativa.
- As páginas legais permanecem marcadas como não aprovadas e sem conteúdo publicável na configuração do servidor.

## Pendências obrigatórias antes da publicação

1. Confirmar razão social, nome fantasia e vínculo com o CNPJ informado (67.314.679/0001-64), validar os dados cadastrais, confirmar endereço e canais de atendimento e privacidade; definir quem responde às solicitações de titulares e eventual encarregado.
2. Validar os papéis de controlador e operador da Central, anfitriões, Stays, Mercado Pago, Supabase, OpenAI, Google/GTM e provedores de e-mail; confirmar compartilhamentos, subprocessadores e transferências internacionais.
3. Completar o inventário de dados (incluindo logs, hospedagem, suporte, antifraude, pagamento e dados de hóspedes acompanhantes), bases legais por finalidade e controles implementados; aprovar retenção, descarte, backups e resposta a incidentes.
4. Conferir tags ativas do GTM, cookies e armazenamento local, comportamento de revogação, dados enviados por cada tag e se todas as tags respeitam a preferência antes de ativar medição ou publicidade.
5. Confirmar em produção quais rotas e recursos estão ativos, incluindo autenticação, Sofia, integração Stays, compra direta, gateway de pagamento e notificações. O código não comprova o estado das contas dos fornecedores nem da operação real.
6. Definir, para cada acomodação e oferta, a política comercial aprovada: condições e cortes temporais, valores eventualmente retidos, eventos de não comparecimento, cancelamento pelo anfitrião, alteração de datas, canal e documentação do pedido. Validar a redação e a compatibilidade com direitos legais.
7. **Bloqueio de publicação — arrependimento em contratação eletrônica:** antes de publicar, disponibilizar a ferramenta de arrependimento pela mesma ferramenta usada para contratar, sem exigir canal externo; confirmar imediatamente o recebimento pelo mesmo meio e integrar o fluxo operacional para comunicar imediatamente a instituição financeira, administradora do cartão ou gateway e impedir o lançamento ou efetivar o estorno, conforme o estado da transação. O código examinado não comprova que esse fluxo esteja implementado de ponta a ponta; não descrevê-lo como já disponível até validar a operação.
8. Definir o fluxo operacional dos demais pedidos de cancelamento e reembolso, responsáveis, evidência de confirmação de cancelamento, meio de pagamento de retorno, prazos comunicados ao consumidor, tratamento de chargeback e canal de acompanhamento. A confirmação imediata de recebimento das demandas eletrônicas e a resposta em até cinco dias também devem ser incorporadas e verificadas conforme o Decreto nº 7.962/2013.
9. Revisar os dois textos com responsável jurídico e publicar somente após aprovação formal, preenchimento das lacunas, implementação e verificação dos requisitos operacionais acima e registro de versão e data.

## Fontes oficiais consultadas

- [Lei nº 13.709/2018 (LGPD), texto compilado — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) — princípios, bases legais, direitos dos titulares, conservação e transferência internacional.
- [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares) — visão orientativa dos direitos e exercício perante o controlador.
- [Lei nº 8.078/1990 (Código de Defesa do Consumidor), texto compilado — Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm) — em especial arts. 6º, 46, 47 e 49.
- [Decreto nº 7.962/2013 — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) — arts. 2º e 4º sobre informações e atendimento no comércio eletrônico e art. 5º, §§ 1º, 3º e 4º, sobre a mesma ferramenta, comunicação à instituição financeira e confirmação imediata do arrependimento.

> Este documento é uma base de trabalho operacional e editorial. A aplicação das normas ao modelo de intermediação, às reservas de hospedagem, às ofertas e ao fluxo de cancelamento depende de validação jurídica e dos fatos da operação.
