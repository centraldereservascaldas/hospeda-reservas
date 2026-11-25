# Proposta do Portal de Controle do Site

**Status:** proposta inicial para discussão  
**Escopo desta proposta:** produto, navegação, experiência e planejamento do front-end. Não autoriza implementação de backend, alterações de banco, credenciais, integrações operacionais ou publicação em produção.

**Decisão de produto já alinhada:** o Portal de Controle do Site deve ser separado do painel de operações. A proposta inclui acompanhamento de reservas e afiliados, mas não presume transferência da operação nem da fonte de verdade da Stays.

**Requisito mobile priorizado:** as jornadas essenciais precisam funcionar bem em telas pequenas. Recursos de apoio menos frequentes devem ser validados por protótipo antes de virarem requisito obrigatório.

**Necessidade mobile destacada:** tarefas comuns, como localizar uma reserva e preparar uma lista segura para entregar ao cliente, precisam ser possíveis no celular sem depender de planilha ou computador. “Whitelist de reservas” é tratado provisoriamente como uma lista compartilhável de reservas. O significado final e os campos liberados precisam ser confirmados antes de implementar o fluxo.

## 1. Resumo

O Portal de Controle do Site será uma área interna para acompanhar a presença digital da Central de Reservas e administrar, de forma visual e segura, o conteúdo e as configurações editoriais do site. A proposta prioriza autonomia da equipe para mudanças comuns no front-end, com editor estruturado, prévia, rascunho, publicação e histórico.

O portal pode apresentar informações de imóveis, reservas existentes, clientes, integrações e afiliados para dar contexto ao desempenho do site. Isso não significa que ele substitua automaticamente o painel operacional, a Stays ou os serviços que hoje são fonte de verdade. Nesta fase, essas áreas são planejadas principalmente como interfaces de consulta e organização. A criação e alteração operacional de reservas, cobrança, disponibilidade, credenciais e configurações de fornecedores ficam fora do escopo inicial.

## 2. Contexto e motivação

Hoje o site público, os fluxos de reserva e os serviços associados têm responsabilidades distintas. A equipe quer ganhar autonomia para configurar conteúdo e apresentação sem depender de alterações de código para cada ajuste. Também deseja entender o que está acontecendo no site, acompanhar imóveis e reservas relacionadas ao canal próprio, integrar uma visão de afiliados e futuramente oferecer uma área específica aos afiliados.

O portal precisa preservar uma distinção compreensível entre:

- o site público, usado por visitantes e hóspedes;
- o Portal de Controle do Site, voltado a conteúdo, apresentação e acompanhamento do canal digital;
- o painel operacional, voltado ao trabalho diário da equipe com reservas, hóspedes, pagamentos e operação;
- o futuro portal do afiliado, voltado ao próprio afiliado e aos seus resultados.

Esses produtos podem compartilhar identidade visual e autenticação, mas devem ter navegação, responsabilidades e permissões próprias.

## 3. Objetivos

1. Permitir mudanças editoriais frequentes sem alterar código.
2. Mostrar indicadores do site com período, origem e horário de atualização claros.
3. Organizar imóveis próprios e conteúdo associado ao site.
4. Dar visibilidade às reservas existentes e à origem delas sem confundir fontes de verdade.
5. Organizar o ciclo de afiliados, desde solicitação até acompanhamento de vendas.
6. Tornar integrações observáveis, apresentando estado e sincronização sem expor segredos.
7. Definir acessos por função e ação, com trilha de auditoria nas ações relevantes.
8. Preparar a evolução do front-end por etapas revisáveis, evitando construir todas as áreas de uma vez.
9. Deixar claros o propósito, a origem e o nível de autoridade de cada dado e ação.

## 4. Não objetivos da primeira fase

- Substituir a Stays como sistema de disponibilidade ou gestão de reservas.
- Criar, alterar, cancelar ou confirmar reservas próprias.
- Processar pagamentos, reembolsos ou repasses.
- Executar SQL, editar tabelas diretamente ou disponibilizar console de banco no portal.
- Armazenar ou revelar chaves, senhas, tokens ou credenciais de integrações.
- Criar permissões de banco ou políticas RLS nesta etapa de planejamento do front-end.
- Fazer alterações irrestritas no HTML, CSS ou JavaScript do site por um editor de código.
- Publicar automaticamente alterações sem revisão e confirmação da pessoa autorizada.
- Tratar métricas de navegação como prova de reserva ou faturamento sem reconciliação com a fonte de dados correspondente.

## 5. Princípios de produto

### 5.1 Separação por responsabilidade

O portal cuida do canal digital e da sua apresentação. Ações operacionais permanecem identificadas como pertencentes ao sistema operacional ou fornecedor responsável. A interface informa a origem e o estado dos dados.

### 5.2 Autonomia dentro de limites seguros

O editor oferece blocos, campos e opções aprovadas. O usuário não precisa editar código para trocar um texto, reorganizar uma seção permitida ou substituir uma imagem. Alterações estruturais avançadas seguem o processo de desenvolvimento.

### 5.3 Fonte e atualização sempre visíveis

Cada métrica ou registro deve indicar de onde veio, o período consultado e quando foi atualizado. Falha ou atraso de integração não deve parecer dado atual.

### 5.4 Acesso mínimo por função

O menu pode ser compartilhado, mas ações, dados e campos são autorizados segundo função e necessidade. “Administrador do portal” não equivale a acesso irrestrito ao banco ou aos sistemas de operação.

### 5.5 Rascunho, revisão e publicação

Conteúdo passa por estados explícitos: rascunho, em revisão, aprovado, publicado e arquivado. Publicação mostra o que mudará, quem está publicando e permite consultar o histórico.

### 5.6 Interface acessível e previsível

Nomes de navegação familiares, hierarquia consistente, foco visível, uso por teclado, estados claros e prevenção de erros em ações importantes são requisitos do produto. A referência de acessibilidade é WCAG 2.2 nível AA, a confirmar em cada fluxo.

## 6. Mapa de navegação proposto

O menu lateral agrupa oito áreas. O número final pode ser reduzido após protótipos e validação com usuários.

```text
Portal de Controle do Site
├── Visão geral
├── Site
│   ├── Páginas
│   ├── Navegação e menus
│   ├── Banners e destaques
│   ├── Biblioteca de mídia
│   └── SEO e metadados
├── Imóveis
│   ├── Catálogo
│   ├── Imóveis próprios
│   └── Conteúdo e publicação
├── Reservas
│   ├── Lista de reservas existentes
│   ├── Visão por origem
│   └── Indicadores do canal
├── Afiliados
│   ├── Solicitações
│   ├── Aprovações e liberações
│   ├── Desempenho e vendas atribuídas
│   └── Regras e materiais
├── Integrações
│   ├── Estado dos serviços
│   ├── Últimas sincronizações
│   └── Eventos e falhas
├── Configurações do site
│   ├── Identidade visual
│   ├── Contatos e redes sociais
│   ├── Formulários e chamadas para ação
│   └── Preferências editoriais
└── Acessos e histórico
    ├── Pessoas e funções
    ├── Permissões
    ├── Histórico de atividades
    └── Sessões e eventos de autenticação (conforme disponibilidade)
```

“Clientes” não precisa ser uma aba independente no primeiro corte. Para evitar transformar o portal em painel operacional, a identificação de hóspedes deve aparecer apenas na medida necessária para entender uma reserva, com acesso restrito e minimização dos dados. Uma área de clientes pode ser reconsiderada se houver um caso de uso claro para o canal digital.

### Hierarquia e nomenclatura

O menu principal deve conter poucos destinos de primeiro nível e agrupar telas irmãs. Rótulos finais devem ser testados com a equipe. Proposta de nomes visíveis:

- **Início:** visão geral e pendências.
- **Conteúdo do site:** páginas, menus, banners, mídia e SEO.
- **Imóveis:** catálogo e edição do conteúdo dos anúncios.
- **Reservas:** acompanhamento das reservas existentes e sua origem.
- **Afiliados:** solicitações, liberações e resultados atribuídos.
- **Integrações:** estado e atualizações dos serviços conectados.
- **Configurações:** identidade e informações editoriais do site.
- **Administração:** pessoas, permissões e histórico.

“Administração” é uma categoria de navegação, não um papel supremo. A localização atual deve permanecer evidente pelo item ativo, título e trilha de navegação.

O portal do afiliado futuro será uma aplicação/experiência separada, ainda que reutilize componentes e identidade visual. Afiliados acessam somente seus próprios materiais e resultados.

## 7. Escopo funcional por área

### 7.1 Visão geral

**Perguntas que responde:** o site está funcionando? O que precisa de atenção? O que mudou? Como o canal se comportou no período?

**Conteúdo sugerido:**

- seletor de período e comparação com período anterior;
- cartões de visitas, páginas vistas, consultas iniciadas e reservas atribuídas, quando as fontes estiverem definidas;
- páginas e conteúdos mais acessados;
- estado do site e das integrações, com última atualização;
- rascunhos esperando revisão e publicações recentes;
- solicitações de afiliados aguardando análise;
- alertas de falhas ou dados desatualizados;
- atalhos para tarefas frequentes.

Cada indicador precisa informar definição, fonte, período e atualização. Conversão e vendas devem ser rotuladas como atribuídas ao canal conforme uma regra explícita, não apresentadas como número absoluto sem contexto.

**Ordem recomendada da tela:** alertas e tarefas prioritárias; saúde do site e atualização das integrações; indicadores principais; tarefas editoriais e solicitações de afiliados; atividade recente e conteúdos populares. Não mostrar cartões vazios para preencher espaço. Se uma métrica ainda não tiver fonte confiável, identificá-la como indisponível ou em planejamento.

### 7.1.1 Análises de negócio e desempenho de hospedagem

O portal deve incluir uma área de análise para entender desempenho do canal e comportamento das reservas. Essa área é **somente leitura**: permite consultar tarifas por data, comparar períodos e estudar padrões, mas não alterar preços, regras de tarifa, disponibilidade ou reservas. Alterações de preço, se um dia forem desejadas, precisam de uma jornada e autorização próprias.

#### Painéis analíticos propostos

1. **Resumo do negócio:** reservas, noites reservadas, receita bruta atribuída, ticket médio por reserva, ocupação, ADR e RevPAR, sempre com período e definição visíveis.
2. **Demanda e calendário:** ocupação e noites reservadas por data de hospedagem, sazonalidade por mês/dia da semana, antecedência das reservas e ritmo de reservas futuras (booking pace), se houver histórico de snapshots suficiente.
3. **Perfil das reservas:** duração média/mediana da estadia, número médio/mediano de hóspedes, distribuição de tamanho dos grupos, antecedência média/mediana e distribuição por faixas.
4. **Tarifas por data:** calendário/tabela de valores publicados ou consultáveis por imóvel e data, origem da tarifa, data da consulta e indicador de disponibilidade. Permite filtrar e comparar, sem edição inline, salvamento ou ação em lote.
5. **Canais e afiliados:** reservas e resultados atribuídos por canal/parceiro, usando regras definidas e mostrando atribuição pendente quando inconclusiva.
6. **Qualidade da operação percebida no canal:** cancelamentos, conversão do funil e falhas de checkout, sempre distinguindo problemas de site, fornecedor e pagamento.

#### Métricas candidatas e definições

| Métrica | Definição inicial | Uso e ressalva |
|---|---|---|
| Reservas criadas | Contagem de reservas cuja data de criação pertence ao período | Exibir separada de estadias realizadas no período. Definir canceladas e duplicadas. |
| Noites reservadas | Soma das noites das reservas válidas | Pode ser agregada pela data em que foi reservada ou pela data da hospedagem; declarar qual. |
| Ocupação | Noites ocupadas ÷ noites vendáveis | Definir inventário vendável e tratamento de bloqueios, manutenção, uso próprio e unidades fora de operação. |
| ADR (diária média realizada) | Receita de hospedagem atribuída ÷ noites vendidas | Definir quais taxas/descontos entram. Não confundir com tarifa anunciada. |
| RevPAR | Receita de hospedagem ÷ noites vendáveis, ou ADR × ocupação sob definições compatíveis | Combina preço realizado e ocupação. Não é lucro. |
| Receita média por reserva | Receita atribuída ÷ número de reservas válidas | Definir receita bruta/líquida, taxas, cancelamentos e momento de reconhecimento. |
| Duração da estadia (LOS) | Noites por reserva; apresentar média, mediana e distribuição | Média isolada é sensível a estadias longas. |
| Hóspedes por reserva | Número de hóspedes declarado por reserva; média, mediana e distribuição | Explicar quando adultos/crianças/acompanhantes estão incompletos. |
| Antecedência (booking lead time) | Dias entre criação/confirmação da reserva e check-in | Definir qual timestamp é usado e como tratar alteração de datas. Mostrar distribuição além da média. |
| Cancelamento | Reservas canceladas ÷ reservas confirmadas/criadas de uma coorte definida | Usar coortes comparáveis e esclarecer janela de observação. |
| Conversão do site | Reservas atribuídas ÷ sessões ou jornadas elegíveis | Definir sessão, consentimento, deduplicação e janela de atribuição. |
| Booking pace | Reservas/noites já captadas para datas futuras em um snapshot, comparadas ao snapshot equivalente anterior | Só é confiável se snapshots históricos forem guardados; não reconstruir como se o histórico existisse. |
| Tarifa consultada por data | Valor retornado/publicado para uma data e imóvel no momento indicado | É preço ofertado naquele instante; não prova preço pago nem disponibilidade futura garantida. |

#### Regras de interpretação

- separar **data da reserva** (quando foi criada) de **data da estadia** (quando o hóspede ficará);
- oferecer ambos os modos de análise, porque respondem perguntas diferentes;
- apresentar média e mediana quando a distribuição puder ser assimétrica, especialmente para antecedência, duração e hóspedes;
- permitir cortes por imóvel, tipo/origem do imóvel, canal, afiliado, mês, dia da semana e faixa de antecedência, apenas quando houver volume suficiente;
- comparar períodos equivalentes e temporadas equivalentes; evitar comparar alta temporada com baixa sem aviso;
- exibir denominador, amostra e cobertura dos dados em taxas e médias;
- quando dados forem incompletos ou a fonte estiver indisponível, marcar cobertura/qualidade e evitar conclusões;
- distinguir números próprios do negócio de benchmarks externos. Benchmark depende de fonte licenciada e comparabilidade local, não faz parte do MVP sem pesquisa e validação comercial;
- não tratar aumento de ocupação, diária ou receita como sinônimo de aumento de lucro ou saúde completa do negócio.

#### Perguntas que o dashboard deve ajudar a responder

- Estamos recebendo mais ou menos reservas do que no período comparável?
- Quanto tempo antes os clientes costumam reservar e essa antecedência está mudando?
- Qual a duração típica da estadia e quantos hóspedes vêm por reserva?
- Quais imóveis/datas têm tarifa consultada alta ou baixa e como isso se relaciona com ocupação realizada?
- A receita por noite vendável está subindo ou a mudança vem apenas de mais noites ocupadas?
- Quais canais trazem reservas, e quais números ainda não têm atribuição confirmada?
- O calendário futuro está avançando no ritmo esperado para a época?

Essas métricas sinalizam tendências e pontos para investigar. O dashboard deve evitar rótulos simplistas de “negócio bom/ruim” sem metas, sazonalidade, custos, cancelamentos e contexto comercial definidos.

### 7.2 Site e conteúdo

- lista de páginas com status, responsável e última edição;
- editor visual por blocos permitidos;
- campos estruturados para textos, imagens, links, chamadas e ordem de seções;
- prévia desktop e mobile;
- rascunho, revisão, aprovação, publicação e arquivamento;
- histórico de versões e comparação entre alterações;
- controles de título, descrição, slug, imagem social e indexação;
- biblioteca de mídia com alt text, dimensões, formato e usos conhecidos;
- validação de links e indicação de campos obrigatórios.

O editor não aceita scripts, HTML arbitrário ou inserção livre de código. Blocos disponíveis devem refletir componentes que o site realmente suporta.

**Fluxo editorial proposto:** abrir conteúdo ou criar rascunho; editar campos e blocos; salvar sem publicar; abrir prévia em desktop/mobile; submeter para revisão; comparar com a versão publicada; aprovar e publicar; confirmar o resultado e localizar a opção de restaurar versão anterior. A interface sinaliza alterações não salvas e protege contra perda acidental ao navegar.

**Modelo conceitual de conteúdo:** página, seção/bloco, campos suportados, mídia referenciada, metadados, estado editorial, versão, autor e datas. Os tipos de bloco são um catálogo controlado, não objetos arbitrários enviados ao site.

### 7.3 Imóveis

- catálogo com busca, filtros e status editorial;
- identificação clara de imóvel próprio, integrado ou de outra origem;
- conteúdo público, fotos, comodidades, título e descrição;
- estado de completude do anúncio e prévia da página;
- origem e horário de sincronização para dados integrados;
- avisos quando um dado é somente leitura ou depende da fonte externa.

O cadastro de um imóvel no portal não deve sugerir que disponibilidade, preço ou reserva já estejam sob controle próprio se ainda dependem de um fornecedor. Na listagem, destacar identidade, status, tipo de origem, completude do conteúdo e última atualização. Dados operacionais devem indicar qual serviço os fornece.

### 7.4 Reservas existentes

- tabela pesquisável e filtrável por período, imóvel, status e origem;
- identificação da fonte de verdade e estado de sincronização;
- detalhes limitados aos dados necessários para consulta;
- ligação entre reserva, canal e afiliado atribuído quando houver regra confiável;
- histórico de atualização e indicação de atraso ou divergência;
- exportação somente para funções autorizadas, com finalidade e registro.

Na primeira fase, tratar esta área como consulta e acompanhamento. A tela não deve oferecer criação, cancelamento, alteração de hóspedes ou mudança financeira.

**Colunas candidatas:** referência mascarada, imóvel, entrada/saída, status da fonte, canal/origem, afiliado atribuído (se validado), última atualização e ação para abrir o resumo. Nome, e-mail, telefone, documento, valor e dados de pagamento não devem ser colunas padrão. Busca por identificador sensível precisa de justificativa e autorização separada.

**Detalhe de reserva:** separar resumo, origem e sincronização; mostrar somente dados pessoais necessários para a função autorizada; identificar a fonte responsável por cada status; exibir divergências sem declarar confirmada uma reserva que a fonte ainda não confirmou.

#### Lista de entrega ao cliente (hipótese para “whitelist”)

O painel pode permitir selecionar uma ou mais reservas e preparar uma **lista de reservas para entrega ao cliente**. Nesta proposta, isso é um artefato de consulta e compartilhamento, não uma lista de permissão técnica, alteração de status, criação de reserva ou acesso direto à base da Stays.

Fluxo sugerido, utilizável em mobile:

1. Localizar reserva por filtros simples, como período, imóvel, referência ou cliente, respeitando permissões.
2. Selecionar registros com controles grandes e legíveis, com ação persistente “Adicionar à lista”.
3. Abrir uma revisão da lista, mostrando quantidade e resumo de cada reserva.
4. Escolher um modelo de entrega aprovado e revisar os campos incluídos antes de gerar o material.
5. Gerar uma visualização compartilhável ou arquivo autorizado e confirmar o destinatário/canal, se aplicável.
6. Exibir sucesso com opção de copiar link/compartilhar e registrar quem gerou a lista, quando, finalidade e quais registros foram incluídos.

Requisitos de segurança e experiência:

- não incluir CPF, documentos, dados de pagamento, telefone ou e-mail por padrão;
- preferir link autenticado com prazo e revogação, ou documento com dados mínimos, em vez de URL pública permanente;
- mostrar validade, destinatário e campos incluídos antes de compartilhar;
- permitir remover um item ou limpar a seleção sem perder a busca;
- confirmar geração/compartilhamento quando houver dados pessoais;
- se a reserva estiver desatualizada ou com status divergente, bloquear a entrega como confirmada e explicar a pendência;
- oferecer alternativa acessível a arrastar e soltar, e manter a ação principal alcançável em telas estreitas;
- registrar falhas e permitir retomar sem duplicar documentos ou links ativos.

Questões em aberto: se a lista é para cliente final, proprietário ou equipe; se contém uma ou várias reservas; formato (página autenticada, PDF ou ambos); prazo e revogação; identidade/contato do destinatário; e quem pode gerar/exportar. Até responder, chamar a função de **lista de entrega** no protótipo para evitar a ambiguidade de “whitelist”.

### 7.5 Afiliados

- fila de solicitações com status e dados de análise necessários;
- etapas de análise, aprovação, recusa e liberação de acesso;
- perfil e materiais disponibilizados;
- visão de cliques, visitas, leads e vendas atribuídas, conforme instrumentação e regras acordadas;
- filtros por período e afiliado, com fonte e método de atribuição explícitos;
- histórico de decisões e alterações.

“Aprovar afiliado”, “liberar acesso” e “aprovar comissão/pagamento” são ações diferentes e devem ser rotuladas separadamente. Valores financeiros ou comissões não serão considerados autoritativos até definir regra comercial, fonte de conversão, janela de atribuição e conciliação.

**Estados da solicitação:** recebida, em análise, aguardando informação, aprovada, recusada e arquivada. O acesso é um estado independente: não convidado, convite enviado, ativo, suspenso ou revogado. Decisões de aprovação, recusa, suspensão ou revogação registram motivo.

**Portal futuro do afiliado:** experiência separada com perfil, links e materiais autorizados, visitas/leads/conversões atribuídas, período, resultados conforme regra comercial publicada e suporte. O afiliado não acessa dados pessoais de hóspedes nem resultados de outros parceiros. O portal interno deve prever esse produto sem colocá-lo no menu interno.

### 7.6 Integrações

- lista de serviços com estado: normal, atenção, indisponível ou desconhecido;
- data da última comunicação/sincronização bem-sucedida;
- última falha em linguagem útil, com identificador técnico para suporte;
- indicador de dados possivelmente desatualizados;
- ligação para documentação interna ou responsável.

A interface não revela segredos, tokens ou valores completos de configuração. Alterar credenciais e executar ações de escrita em fornecedor ficam fora do escopo do portal nesta fase. Diferenciar conexão observada, sincronização dos dados, atraso e disponibilidade funcional. “Conectado” sozinho não prova que os dados estão atualizados. Não incluir nesta fase um botão genérico de sincronização, que pode causar escrita, custo ou carga no fornecedor.

### 7.7 Configurações do site

- marca, logotipo, cores por tokens aprovados e elementos institucionais;
- telefone, e-mail, endereço e links sociais;
- textos de chamadas para ação e informações de contato;
- opções de formulários suportados;
- configurações editoriais com descrição do impacto;
- prévia e histórico das mudanças.

Preferências de segurança, autorização, pagamentos ou conexão com serviços não entram nesta área editorial.

### 7.8 Acessos e histórico

- usuários convidados/ativos/suspensos;
- funções e permissões descritas em linguagem operacional;
- data do último acesso e eventos relevantes, conforme a identidade fornecer;
- histórico de visualizações sensíveis, alterações, aprovações e publicações;
- filtros por pessoa, ação, área, período e resultado;
- exportação de auditoria com acesso restrito.

O log não armazena senhas, tokens, segredos ou conteúdo pessoal desnecessário. O portal deve distinguir eventos de autenticação fornecidos pelo provedor dos eventos de uso registrados pela aplicação.

### 7.9 Busca, ajuda e notificações

- busca global encontra páginas, imóveis e áreas que o usuário já pode acessar;
- resultados não revelam registros ou campos fora da permissão do usuário;
- notificações apontam para uma tarefa concreta, mostram prioridade e podem ser marcadas como lidas;
- preferências controlam notificações informativas sem ocultar alertas críticos de segurança;
- ajuda contextual explica termos, origem dos dados e limites de cada ação.

## 8. Papéis e catálogo de permissões inicial

Papéis são um ponto de partida para conversa. Permissões finais devem ser compostas por recurso e ação, sem confiar apenas em esconder itens do menu.

| Papel | Acesso esperado |
|---|---|
| Administrador do portal | Gerencia usuários e funções do portal, configura suas áreas permitidas e consulta auditoria. Não recebe automaticamente credenciais ou acesso irrestrito ao banco. |
| Editor de conteúdo | Cria e edita rascunhos; não publica por padrão. |
| Revisor/publicador | Revisa, aprova e publica conteúdo conforme escopo concedido. |
| Gestor de catálogo | Administra conteúdo editorial de imóveis permitidos. |
| Gestor de afiliados | Analisa solicitações e acompanha resultados de afiliados. |
| Analista | Consulta dashboards e relatórios permitidos, sem alterar conteúdo ou cadastros. |
| Suporte técnico | Consulta saúde e falhas técnicas sem acesso automático a dados pessoais ou financeiros. |
| Afiliado (futuro portal separado) | Acessa apenas seu perfil, seus materiais e seus resultados. |

Permissões sugeridas por ação: `visualizar`, `criar rascunho`, `editar`, `submeter para revisão`, `aprovar`, `publicar`, `arquivar`, `exportar`, `gerenciar acessos`. Acesso a dados pessoais deve ser uma permissão separada.

Uma conta de emergência/suprema, se aprovada depois, é uma exceção de acesso controlado. Não deve ser a conta cotidiana, compartilhada ou capaz de executar SQL pelo portal. Acesso direto ao banco pertence a um processo técnico separado, com credenciais próprias e auditoria da plataforma de banco.

### Matriz inicial de acesso

`V` = visualizar, `E` = editar, `R` = revisar/publicar, `G` = administrar. Esta hipótese deve ser validada; não é especificação de autorização pronta para produção.

| Área | Admin do portal | Editor | Publicador | Catálogo | Afiliados | Analista | Suporte |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dashboard agregado | V | V | V | V | V | V | V |
| Conteúdo | G | E | R | V | V | V | V |
| Imóveis | G | V | V | E | V | V | V |
| Reservas resumidas | V* | V* | V* | V* | V* | V* | V* |
| Dados pessoais de reservas | Condicional | Não | Não | Não | Não | Não | Não |
| Solicitações de afiliados | V* | Não | Não | Não | E | V* | Não |
| Vendas atribuídas | V* | Não | Não | Não | E | V* | Não |
| Saúde de integrações | V | V | V | V | V | V | V |
| Usuários e permissões | G | Não | Não | Não | Não | Não | Não |
| Auditoria | G | V própria | V própria | V própria | V própria | V própria | V técnica |

`*` Acesso depende de necessidade, com dados mascarados por padrão. A matriz final deve ser granular por ação e campo, não uma associação simples entre papel e tela.

## 9. Modelo de experiência e layout

### Estrutura global

- barra superior com nome do portal, ambiente, busca global, notificações e perfil;
- menu lateral com grupos recolhíveis, rótulos textuais e estado ativo evidente;
- área principal com título, descrição curta, trilha de navegação e ações da página;
- filtros locais próximos dos dados que afetam;
- responsividade com navegação móvel e sem tabelas inutilizáveis em telas estreitas.

### Experiência mobile como requisito de primeira classe

Mobile não será uma versão comprimida do desktop. Consulta e tarefas rápidas precisam funcionar por toque, com leitura em movimento e layout de uma coluna.

**Navegação e orientação**

- menu lateral vira navegação móvel acessível, com título da área atual e retorno previsível;
- manter acesso rápido a Início, busca e notificações sem ocupar grande parte da tela;
- mostrar título e contexto antes das ações;
- preservar filtros, item selecionado e posição da lista ao abrir detalhe e voltar;
- evitar menus profundos.

**Toque, leitura e formulários**

- alvos de toque confortáveis e separados, com rótulos explícitos;
- uma ação primária por tela, com ações secundárias em menu claro;
- formulários em coluna única, teclado adequado ao campo e erros junto ao campo;
- não depender de hover, gestos complexos, arrastar e soltar ou cor isolada;
- filtros recolhíveis com resumo dos filtros ativos e ação clara para aplicar/limpar;
- tabelas densas viram cartões com rótulos, preservando comparação útil.

**Estados e conectividade**

- mostrar carregamento, atualização, falha e idade dos dados sem depender de animação;
- permitir tentar novamente e preservar alterações editoriais não publicadas quando adequado;
- não guardar reservas, dados pessoais ou links secretos em cache local sem decisão explícita;
- indicar quando uma ação exige conexão e impedir que toque repetido gere duplicidade;
- apresentar resultado perto da ação que o originou.

**Ações móveis sensíveis**

- revisão em tela própria ou folha inferior com nome, quantidade, impacto e destinatário;
- confirmar e cancelar visíveis e distintos;
- não usar swipe como único meio de aprovar, excluir, publicar ou compartilhar;
- após concluir, oferecer próximo passo sem esconder o estado final;
- evitar que teclado virtual ou área segura do aparelho cubra o conteúdo.

### Jornadas prioritárias para validar no celular

1. Abrir o painel, reconhecer alertas e localizar uma tarefa pendente.
2. Buscar um imóvel, revisar conteúdo e enviar um rascunho para aprovação.
3. Encontrar reserva e verificar status, origem e atualização.
4. Montar e revisar uma lista de entrega ao cliente, com dados mínimos, e compartilhar pelo mecanismo aprovado.
5. Analisar solicitação de afiliado e registrar uma decisão.
6. Verificar falha de integração e encaminhar para suporte sem alterar credenciais.

Cada jornada deve ser testada em viewport estreita, com teclado aberto, rolagem, zoom de texto e rede lenta. Definir dispositivos de referência com base nos dados de uso e nos componentes existentes.

### Hierarquia visual

1. Estado ou tarefa prioritária.
2. Título e contexto da página.
3. Ação principal.
4. Filtros e conteúdo de trabalho.
5. Metadados e histórico.

Dashboard prioriza alertas e decisões; tabelas priorizam busca, filtros e leitura; editor prioriza conteúdo, prévia e estado de publicação.

### Padrões para listas e detalhes

- manter busca, filtros ativos e período visíveis;
- permitir limpar filtros e informar quantidade de resultados;
- ordenar por colunas úteis com indicação acessível;
- paginar listas extensas e preservar filtros ao abrir e fechar um registro;
- oferecer ações em linha somente quando frequentes e seguras;
- manter ações privilegiadas no detalhe, com confirmação e explicação;
- em telas estreitas, usar cartões ou rolagem identificada sem esconder a ação principal;
- operações em lote mostram quantidade selecionada, ação e opção de limpar; no celular não cobrem filtros nem conteúdo.

### Sistema visual

Reutilizar identidade da marca e tokens existentes quando fizer sentido, mas estabelecer linguagem própria de interface interna: tipografia legível, densidade controlada, hierarquia de títulos, escalas de espaçamento, estados que não dependem só de cor e componentes consistentes. Evitar gráficos decorativos sem pergunta operacional clara.

### Estados obrigatórios

Todas as telas devem prever carregamento, erro recuperável, estado vazio, conteúdo parcial, sucesso e dados desatualizados. Cada tabela prevê nenhum resultado e filtros sem correspondência. Ações de publicação, aprovação, liberação de acesso e exportação precisam deixar claro o resultado e o próximo passo.

## 10. Métricas e observabilidade do site

O dashboard pode mostrar tráfego, caminhos mais acessados, consultas iniciadas, erros capturados e atribuição de afiliados somente se a instrumentação e o consentimento aplicáveis estiverem definidos. Os cartões devem exibir:

- nome e definição da métrica;
- fonte de dados;
- período, fuso horário e comparação;
- data/hora da última atualização;
- limitações conhecidas e possíveis lacunas;
- acesso aos dados agregados sem expor identificadores pessoais desnecessários.

Analytics, eventos técnicos, logs de acesso e dados de reserva são categorias distintas. A interface não deve juntar essas fontes como se fossem um único registro. Retenção, base legal, consentimento e acesso a dados pessoais exigem definição própria antes da implementação.

| Grupo | Exemplos | Observação de produto |
|---|---|---|
| Aquisição | sessões, origem/canal, campanhas | Definir ferramenta, consentimento e atribuição. |
| Navegação | páginas vistas, páginas populares, busca interna | Separar tráfego humano conhecido de ruído quando houver método confiável. |
| Intenção | início de busca, visualização de imóvel, início de checkout | Eventos não equivalem a compra ou reserva. |
| Resultado | reservas atribuídas, conversão, receita atribuída | Fonte e janela de atribuição precisam ser reconciliadas. |
| Qualidade técnica | erros de interface, disponibilidade, falhas de integração | Agregar e remover conteúdo pessoal/segredos das mensagens. |
| Conteúdo | rascunhos, publicações, páginas incompletas | Métricas acionáveis para gestão editorial. |
| Afiliados | visitas, leads, reservas atribuídas, vendas | Definir clique, janela, deduplicação e regra de atribuição. |

## 11. Diretrizes de segurança refletidas no front-end

Estas diretrizes orientam a interface, mas controles reais precisam ser impostos no servidor e no banco:

- menu e ações respeitam permissões, com checagem autoritativa no backend;
- acesso negado e sessão expirada têm estados claros, sem vazamento de dados;
- ações críticas exibem impacto, escopo e confirmação adequada;
- dados pessoais são mascarados quando a tarefa não exige revelação;
- telas de auditoria são somente leitura para a maioria dos usuários;
- chaves e credenciais não aparecem em campos de texto, logs de interface ou erros;
- edição/publicação usa prévia e registra ator, momento, ação e resultado;
- componentes de UI não são considerados barreira suficiente para proteger endpoints;
- permissões de leitura de reservas, dados pessoais, exportação, gestão de usuários e publicação são distintas;
- protótipos usam dados fictícios identificados, sem copiar registros de produção.

## 12. Fases de trabalho propostas

### Fase 0: descoberta e validação

- mapear usuários, tarefas e frequência de uso;
- levantar telas e padrões existentes no site e no painel operacional;
- confirmar métricas disponíveis e suas fontes;
- inventariar tipos de conteúdo e componentes atuais do site;
- validar nomenclatura e limites entre portal do site e operação;
- mapear tarefas por frequência, risco e impacto e identificar responsáveis;
- revisar o painel de operações apenas para reconhecer padrões visuais reaproveitáveis.

**Entrega:** mapa de navegação validado, glossário e inventário de telas.

### Fase 1: fundação visual

- identidade do portal e shell (menu, topo, breadcrumb e responsividade);
- componentes base de tabela, filtro, cartão, status, alerta e formulário;
- fluxo conceitual de autenticação e acesso negado;
- dashboard com dados de demonstração claramente identificados.

**Entrega:** protótipo navegável do layout e da hierarquia.

### Fase 2: dashboard e conteúdo

- cartões e alertas com fonte/atualização;
- lista de páginas e editor por blocos;
- rascunho, prévia, revisão e confirmação de publicação em protótipo.

**Entrega:** fluxo editorial revisável, ainda sem publicação real.

### Fase 3: imóveis e reservas em consulta

- catálogo e estados de origem/sincronização;
- tabela de reservas existentes com permissões visuais e dados fictícios;
- detalhamento de origem, histórico e estados vazios/atrasados.
- protótipo mobile da lista de entrega, com dados fictícios e revisão dos campos compartilhados.

**Entrega:** jornadas de consulta revisadas sem comandos operacionais.

### Fase 4: afiliados e integrações

- solicitações e etapas de aprovação/liberação em protótipo;
- dashboard de vendas atribuídas com regras ainda explícitas como pendentes;
- saúde de integrações e estados de falha.

**Entrega:** jornadas administrativas de afiliados e observabilidade revisadas.

### Fase 5: validação de produto e especificação técnica

- testes de usabilidade com usuários internos;
- revisão de acessibilidade, conteúdo, responsividade e permissões;
- especificação dos dados e serviços necessários para cada tela;
- decisão separada sobre backend, autenticação, RLS, logs e integrações.

**Entrega:** front-end aprovado e backlog técnico delimitado.

### Sequência recomendada de prototipação

1. Shell e dashboard para validar navegação e linguagem visual.
2. Lista, editor e publicação de conteúdo, principal promessa de autonomia.
3. Catálogo de imóveis, distinguindo origem externa e própria.
4. Reservas somente leitura, com estados de origem e privacidade.
5. Fila de afiliados e análise, separando decisão de acesso e métrica comercial.
6. Integrações, acessos e auditoria, com foco em estados e permissões.

Cada protótipo deve ser revisado em desktop e mobile, com dados fictícios, e percorrer uma jornada completa, incluindo erro, cancelamento e retorno à lista.

## 13. Critérios de aceite do planejamento de front-end

- cada item do menu tem propósito, usuário e limite de responsabilidade documentados;
- o usuário consegue localizar as tarefas principais sem conhecer nomes técnicos;
- dashboards mostram origem, período e atualização dos números;
- estados de carregamento, erro, vazio, sucesso e desatualização estão previstos;
- conteúdo pode ser revisado em prévia antes de publicação;
- origem e caráter somente leitura dos dados externos estão visíveis;
- reservas e clientes não são confundidos com cadastro editorial de imóveis;
- afiliado não consegue ver dados de outro afiliado no desenho de permissões;
- ações críticas e acessos a dados sensíveis aparecem no catálogo de auditoria;
- fluxos centrais funcionam por teclado, com foco visível e rótulos claros;
- telas em mobile mantêm a hierarquia e as ações essenciais;
- jornadas prioritárias funcionam sem rolagem horizontal ou gestos exclusivos;
- formulários e ações continuam utilizáveis com teclado virtual aberto e zoom de texto;
- seleção em lote e compartilhamento mostram quantidade, destinatário e campos incluídos;
- links/documentos de entrega não são públicos por padrão e exibem validade e revogação quando aplicável;
- menu não mistura conteúdo editorial com comandos operacionais de reserva;
- experiência do afiliado é distinta da equipe interna;
- telas não apresentam dados simulados como dados conectados;
- métricas de navegação, intenção e resultado têm nomes e definições distintos;
- filtros, ordenação, paginação e retorno estão definidos para listas extensas;
- conteúdo não publicado é distinguível do conteúdo público;
- busca e notificações não revelam dados fora da permissão.

## 14. Decisões em aberto

1. O portal será um app independente ou uma área dentro de um repositório existente?
2. Qual padrão de domínio será usado para separar site público, portal e painel operacional?
3. Quais usuários internos e funções existem de fato hoje?
4. Quais métricas de tráfego estão disponíveis e quais dependem de consentimento?
5. Qual fonte identifica uma reserva como originada pelo site ou atribuída a afiliado?
6. O que caracteriza “imóvel próprio” no produto e qual sistema é fonte de disponibilidade/preço?
7. Afiliados serão aprovados por uma pessoa, por duas ou por regra definida?
8. Qual é o ciclo de revisão/publicação de conteúdo e quem pode reverter uma publicação?
9. Quais dados de hóspede precisam aparecer no portal, para quais funções e por quanto tempo?
10. Quais eventos e dados precisam ficar na auditoria e qual será sua retenção?
11. Quais mudanças ficam no portal, quais ficam em código e quais exigem operação técnica no banco?
12. Em que momento a independência da Stays passa a ser um projeto separado de reservas próprias?
13. Quais páginas, seções e campos do site devem ser editáveis sem código no primeiro lançamento?
14. Quem revisa conteúdo e a mesma pessoa pode aprovar e publicar o próprio trabalho?
15. Qual conteúdo pode ser revertido diretamente e qual exige nova revisão/publicação?
16. Quais filtros, campos e exportações de reservas são realmente necessários?
17. Qual fuso horário será padrão nos relatórios e como tratar períodos incompletos?
18. Qual canal de notificação é desejado e quais eventos são urgentes?
19. Como usuários internos serão convidados, suspensos e removidos?
20. Qual será o fluxo de suporte para reportar uma falha do próprio portal?
21. O que exatamente significa “whitelist de reservas”: lista para cliente, proprietário, equipe ou autorização técnica?
22. Quais campos o destinatário deve receber e por qual canal/formato?
23. O destinatário precisará autenticar-se e qual prazo/revogação a lista terá?
24. Quais tarefas precisam ser plenamente concluíveis no celular?
25. Quais larguras, dispositivos e condições de rede serão referência de validação mobile?
26. Qual fonte fornece histórico confiável de tarifa por imóvel/data e qual profundidade temporal existe?
27. A receita de dashboard será valor de hospedagem, total pago pelo cliente ou valor líquido após taxas/comissões?
28. Como são definidos noites vendáveis e bloqueios para o cálculo de ocupação e RevPAR?
29. Qual evento e timestamp definem a data de criação para lead time e booking pace?
30. Há snapshots históricos de disponibilidade e reservas futuras para calcular ritmo de reservas?
31. Quais metas internas, se existirem, podem servir de referência por temporada e tipo de imóvel?

## 15. Vocabulário proposto

- **Portal do site:** área interna de gestão e acompanhamento do canal digital.
- **Conteúdo:** material editorial e visual apresentado no site.
- **Imóvel próprio:** imóvel cujo conteúdo/cadastro é administrado pela equipe; o termo não implica independência de disponibilidade ou reserva.
- **Reserva existente:** registro recebido de uma fonte já ativa; não significa que o portal possa alterá-lo.
- **Integração:** conexão com serviço externo e estado observado dessa conexão.
- **Afiliado:** parceiro com solicitação, estado de acesso e métricas de atribuição definidas.
- **Publicação:** tornar uma versão aprovada do conteúdo visível no site.
- **Administrador do portal:** pessoa que administra acessos e funções do portal, sem poderes implícitos de banco ou operação financeira.

## 16. Riscos de produto e dependências

| Risco/dependência | Consequência | Resposta no desenho |
|---|---|---|
| Misturar portal editorial e operação | Confusão entre consulta e autoridade para executar ações | Navegação e ações distinguem consulta, edição e operação. |
| Métricas com fontes diferentes | Dashboard contraditório ou interpretação errada | Fonte, atualização e definição visíveis. |
| Dados pessoais expostos por conveniência | Acesso excessivo e risco de privacidade | Minimização, mascaramento e permissão específica. |
| Editor permitir conteúdo não suportado | Layout quebrado ou conteúdo inseguro | Blocos controlados, validação e prévia. |
| Atribuição de afiliados indefinida | Vendas ou comissões contestadas | Não exibir valor como definitivo antes da regra e reconciliação. |
| Atraso de integração | Dados antigos parecem atuais | Idade do dado, estado e avisos explícitos. |
| Menu crescer demais | Baixa encontrabilidade | Agrupamento e validação com usuários. |
| Protótipo prometer capacidade indisponível | Expectativa de funcionalidade inexistente | Identificar dado real, demonstração e futuro. |

## 17. Referências e evidências do projeto

- Repositório atual, convenções e arquitetura: `README.md` e `AGENTS.md`.
- Design system inicial do portal, tokens, componentes e processo para novas telas: `docs/site-control-design-system.md` e `src/components/site-control/`.
- Qualidade e acessibilidade do front-end: `docs/frontend-quality-plan.md`.
- Integração e limites atuais de Stays: `docs/stays-checkout-flow.md` e `docs/stays-external-api.md`.
- Instrumentação de analytics e consentimento: `src/utils/measurementConsent.ts` e `src/utils/measurementEvents.ts`.
- O projeto já possui interface administrativa de proprietário em `src/components/owner/OwnerAccessAdminView.tsx` e rotas `/api/owner/admin/*`. Inventariar suas funções antes de criar navegação ou duplicar ações.
- O checkout atual consulta Stays no backend. A documentação do projeto registra que a jornada própria de venda ainda não foi validada ponta a ponta e suas flags permanecem desligadas; esta proposta não assume reservas próprias em produção.
- Validar a instrumentação e consentimento existentes antes de desenhar indicadores como se todos os eventos fossem coletados.
- OWASP, autorização por padrão negado e privilégio mínimo: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>.
- OWASP, logging de eventos de segurança e acesso: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>.
- Supabase, RLS, grants e limitações de chaves privilegiadas: <https://supabase.com/docs/guides/database/postgres/row-level-security>.
- W3C, WCAG 2.2: <https://www.w3.org/WAI/WCAG22/Understanding/>.
- AirDNA Help Center, métricas de desempenho de aluguel por temporada, incluindo ADR, ocupação ajustada, RevPAR, duração da estadia, antecedência e dimensões das reservas: <https://help.airdna.co/en/articles/16975794-my-performance-page-what-it-is-and-how-it-works>.
- AirDNA, definição de ADR e alerta para interpretar tarifa junto com ocupação: <https://help.airdna.co/en/articles/8062173-how-does-airdna-calculate-average-daily-rate-adr>.
- AirDNA Enterprise, visualização de duração da estadia e antecedência de reserva: <https://enterprise-help.airdna.co/en/articles/8886507-navigating-the-tourism-insights-dashboard>.
- CoStar/STR Benchmark, glossário de métricas hoteleiras como ADR, ocupação e RevPAR: <https://www.costar.com/en-gb/gbr/products/str-benchmark/resources/glossary>.

As definições de mercado não são automaticamente compatíveis entre ferramentas: composição de receita, noites vendáveis, bloqueios e canais variam. O produto deve aprovar definições internas antes de publicar KPIs ou comparar com benchmarks.

## 18. Checklist mestre de execução do front-end

Este checklist converte a proposta em trabalho executável para construir o Portal Interno da **Central de Reservas Caldas Novas**. Ele é prioritariamente um plano de interface e experiência local. Marque itens somente depois de revisar a tela/fluxo correspondente e seu critério de aceite. Dados e ações demonstrativos devem ser explicitamente identificados.

### 18.1 Convenções de acompanhamento

- `[ ]` pendente; `[x]` concluído e revisado.
- **P0** bloqueia a fundação ou jornada central; **P1** necessário para o primeiro corte funcional; **P2** evolução após validação do MVP.
- **FE** pode ser resolvido no protótipo front-end; **DECISÃO** requer escolha de produto; **BACKEND** só pode ser implementado em etapa futura, não neste checklist de front-end.
- Uma decisão marcada não impede desenhar estrutura demonstrativa quando o comportamento real pode ficar claramente inerte.
- Cada item concluído deve apontar a tela ou componente e registrar pendências, se houver. Não marcar decisão de produto como tomada por conveniência de implementação.

### 18.2 Fase A — descoberta, escopo e proteção do projeto (P0)

- [ ] **FE** Confirmar objetivo e usuários da primeira versão: equipe editorial, gestão de catálogo, gestão de afiliados, análise e suporte.
- [ ] **FE** Separar visual e funcionalmente o Portal Interno da Central de Reservas, o site público, o painel operacional e o futuro portal do afiliado.
- [ ] **FE** Definir a promessa do primeiro corte: administrar conteúdo do site e visualizar contexto do canal digital.
- [ ] **FE** Confirmar explicitamente que o portal não é o painel operacional nem substitui a Stays.
- [ ] **FE** Inventariar o site público e identificar logo, tipografia, cores, estados, foco, espaçamento, bordas, sombras e componentes existentes.
- [ ] **FE** Inventariar a área existente de proprietário/admin e mapear sobreposições, sem reutilizar rotas ou ações operacionais como parte do protótipo.
- [ ] **FE** Inspecionar as jornadas atuais de catálogo, busca, detalhe, conta e checkout para evitar impacto nas rotas existentes.
- [ ] **FE** Definir uma entrada local isolada para o protótipo e registrar se ela deve existir apenas em desenvolvimento.
- [ ] **FE** Validar rota direta, refresh, navegação interna e fallback da rota do portal sem interferir nas rotas públicas.
- [ ] **FE** Não criar formulário que solicite credenciais do site, Stays ou outros serviços para dar aparência de autenticação.
- [ ] **FE** Definir fixtures exclusivamente sintéticas, com referência visual inequívoca de “DEMO” em reservas, métricas e afiliados.
- [ ] **FE** Manter alterações do portal sob domínio de arquivos próprio e isolar CSS para não vazar ao site público.
- [ ] **DECISÃO** Validar nomenclatura final do produto: Portal Interno da Central de Reservas Caldas Novas.
- [ ] **DECISÃO** Escolher as áreas que formam o MVP visível; as demais podem estar marcadas “planejado” sem simular capacidade pronta.
- [ ] **BACKEND** Manter autenticação real, autorização, dados de produção, persistência e integrações fora da execução deste checklist front-end.

**Gate A:** escopo, usuário, entrada local e limites de autoridade compreensíveis antes de ampliar a navegação.

### 18.3 Fase B — identidade visual e sistema de componentes (P0)

- [ ] **FE** Revisar `docs/site-control-design-system.md` e os componentes/tokens já existentes em `src/components/site-control/`; consolidar lacunas em vez de criar um segundo sistema paralelo.
- [ ] **FE** Usar o componente oficial `LogoCRCN` e a tipografia Plus Jakarta Sans; identificar a Central de Reservas sem criar marca paralela ou nomenclatura de workspace.
- [ ] **FE** Referenciar acento e neutros existentes do site CRCN; não alterar os estilos globais do site principal.
- [ ] **FE** Definir tokens semânticos locais para marca, texto, superfície, borda, foco, estados, escala tipográfica, espaçamento, raio, sombra e camadas.
- [ ] **FE** Definir regras de densidade: administração permite informação objetiva, preservando leitura, hierarquia e espaçamento.
- [ ] **FE** Criar ou consolidar componentes-base: botão, campo, seletor, cartão, status, alerta, cabeçalho de página, barra de filtro, estado vazio, confirmação e navegação.
- [ ] **FE** Definir variantes dos componentes e exemplos de uso correto/incorreto no próprio sistema.
- [ ] **FE** Garantir estados default, hover quando suportado, foco, pressionado, desabilitado, carregando, erro e sucesso.
- [ ] **FE** Definir que cor nunca comunica estado sozinha; combinar rótulo e forma/ícone quando necessário.
- [ ] **FE** Verificar contraste de texto, foco e controles contra WCAG 2.2 AA como alvo de projeto.
- [ ] **FE** Confirmar que componentes comuns são semânticos e realmente reutilizáveis; evitar atomização artificial e arquivos barrel sem necessidade.
- [ ] **FE** Garantir que seletores CSS estejam limitados a `.site-control-portal` ou classes do portal.
- [ ] **FE** Produzir exemplos visuais de tipografia, botões, campos, status, alertas, cartões, tabela, menu e mobile antes de expandir telas.

**Gate B:** uma nova tela consegue ser montada com tokens e componentes existentes, sem copiar estilos de forma divergente.

### 18.4 Fase C — shell, navegação e acesso interno demonstrativo (P0)

- [ ] **FE** Criar shell desktop com marca, nome do Portal Interno da Central de Reservas, contexto do canal digital, navegação lateral, título, breadcrumb e área de conteúdo.
- [ ] **FE** Criar navegação móvel com abertura/fechamento acessíveis, foco previsível e retorno à tela atual.
- [ ] **FE** Definir rótulos em português claros e separados por responsabilidade: visão geral, conteúdo, imóveis, reservas, afiliados, integrações e administração.
- [ ] **FE** Marcar visualmente o item ativo e manter contexto ao navegar para detalhe e retornar.
- [ ] **FE** Criar seletor de identidade/contexto apenas se houver mais de um site/ambiente real; caso contrário mostrar identificação estática para não prometer multi-tenant.
- [ ] **FE** Exibir indicação persistente de “Demonstração local” em protótipos e prévias para evitar confusão com teste ou produção reais.
- [ ] **FE** Desenhar estados de tela sem acesso, sessão expirada, carregamento de perfil e falha de identidade como protótipo visual, sem simular segurança real.
- [ ] **FE** Não apresentar uma tela de acesso demonstrativa como proteção real, nem pedir senha/credencial existente do site para entrar no protótipo.
- [ ] **FE** Desenhar perfil da pessoa com nome, papel demonstrativo, preferências e ação de sair visualmente identificada como inerte.
- [ ] **FE** Prever central de ajuda, busca global e notificações sem produzir links mortos que pareçam operacionais; usar destino demonstrativo ou estado “planejado”.
- [ ] **FE** Assegurar que busca e navegação demonstrativas não revelem dados ocultos em estados de permissão.
- [ ] **DECISÃO** Validar lista de papéis internos e se há segregação de funções obrigatória.
- [ ] **DECISÃO** Determinar convite, MFA, recuperação de acesso, expiração de sessão e política de dispositivos para a etapa de autenticação real.
- [ ] **BACKEND** Não tratar permissões visuais como autorização; enforcement deve ser definido em etapa própria no servidor.

**Gate C:** shell navegável por teclado e toque, nomenclatura correta e sem se confundir com site público ou operação.

### 18.5 Fase D — visão geral e métricas demonstrativas (P1)

- [ ] **FE** Definir a pergunta principal que o dashboard responde e limitar conteúdo a decisões/tarefas úteis.
- [ ] **FE** Organizar prioridade da tela: alertas acionáveis, tarefas pendentes, estado do site, métricas, atividade recente.
- [ ] **FE** Definir cartão de métrica com nome, número, unidade, período, comparação, fonte e atualização.
- [ ] **FE** Identificar toda fixture como demonstrativa; evitar números que pareçam extraídos de operação real.
- [ ] **FE** Diferenciar tráfego, intenção de busca, checkout iniciado, reserva atribuída e reserva confirmada.
- [ ] **FE** Criar estado sem dados, indisponível, atrasado, parcial, carregando e erro recuperável.
- [ ] **FE** Mostrar denominador e cobertura para percentuais e taxas.
- [ ] **FE** Permitir seleção de período visualmente, mas não insinuar que o seletor consulta analytics real.
- [ ] **FE** Usar gráficos apenas quando respondam uma pergunta de negócio; incluir legenda e alternativa textual/resumo.
- [ ] **DECISÃO** Definir métricas e fontes que realmente devem entrar no MVP.
- [ ] **DECISÃO** Definir fuso horário, comparação sazonal e janela de atribuição antes de usar números reais.
- [ ] **BACKEND** Instrumentação, consentimento, coleta e reconciliação de conversão são dependências posteriores.

#### Análises de negócio, reservas e tarifas (exploração posterior ao núcleo do MVP)

- [ ] **FE** Tratar análises como área de consulta distinta da visão geral e do painel operacional; não oferecer edição de tarifa, disponibilidade ou reserva.
- [ ] **FE** Só mostrar como disponível uma área analítica quando houver fonte/caso de uso aprovado; demais módulos ficam identificados como planejados.
- [ ] **FE** Separar o modo por data de criação da reserva do modo por data da hospedagem e manter o modo explícito no cabeçalho e filtros.
- [ ] **FE** Planejar, sem implementar todas no primeiro corte, módulos independentes para resumo do negócio, demanda/calendário, perfil das reservas, tarifas por data, canais/afiliados e qualidade do funil.
- [ ] **FE** Definir cada KPI com conceito, unidade, numerador, denominador, período, fuso, fonte, cobertura da amostra, atualização e estado de confiabilidade.
- [ ] **FE** Distinguir tarifa consultada de preço pago, ocupação de disponibilidade, receita bruta de líquida e reserva criada de confirmada/realizada.
- [ ] **FE** Mostrar média e mediana/distribuição quando a média isolada puder esconder assimetria; indicar amostra insuficiente e evitar rankings enganosos.
- [ ] **FE** Desenhar comparação de períodos equivalentes e estado sem histórico; não reconstruir booking pace sem snapshots históricos.
- [ ] **FE** Fazer tabela/calendário de tarifas somente leitura, informando imóvel, data, moeda, origem, momento da consulta e limite de validade.
- [ ] **FE** Distinguir falha do site, fornecedor e pagamento no funil, sem atribuir causa não comprovada.
- [ ] **FE** Não apresentar benchmarks como disponíveis sem fonte licenciada, comparabilidade e decisão de produto.
- [ ] **DECISÃO** Definir receita, noites vendáveis, bloqueios, cancelamentos, lead time, coortes e snapshots antes de usar dados reais.
- [ ] **DECISÃO** Escolher perguntas analíticas do MVP e filtros suportados com amostras suficientes.
- [ ] **BACKEND** Histórico, snapshots, agregações e contratos analíticos somente leitura são dependências posteriores com fonte validada.

**Gate D:** o usuário consegue distinguir, sem conhecimento técnico, número de demonstração, número conectado, fonte e atualidade.

### 18.6 Fase E — conteúdo e configuração editorial do site (P0/P1)

- [ ] **FE** Criar lista de páginas com título, caminho, estado editorial, responsável e última edição.
- [ ] **FE** Criar busca, filtro por estado, ordenação e estado vazio.
- [ ] **FE** Criar detalhe/editor com campos suportados e catálogo controlado de blocos.
- [ ] **FE** Suportar rascunho local, aviso de alteração não salva, cancelamento e recuperação de edição demonstrativa.
- [ ] **FE** Criar prévia desktop/mobile sem executar código arbitrário.
- [ ] **FE** Diferenciar publicado, rascunho, revisão, aprovado, arquivado e falha de publicação.
- [ ] **FE** Desenhar submissão para revisão, comparação com versão publicada, aprovação e confirmação como fluxo demonstrativo.
- [ ] **FE** Exibir claramente que salvar/submeter/publicar não altera o site real nesta fase.
- [ ] **FE** Prever título/descrição SEO, slug, imagem social, indexação e validações de limite.
- [ ] **FE** Projetar biblioteca de mídia com estado de carregamento, vazio, erro, alt text, dimensões e usos.
- [ ] **FE** Projetar gestão de menus/navegação com ordenação acessível por controles alternativos a drag-and-drop.
- [ ] **FE** Projetar banners/destaques com campos, período de exibição, prévia e conflitos de agenda demonstrativos.
- [ ] **FE** Projetar configuração institucional editável: nome público, contatos, redes sociais e chamadas para ação autorizadas.
- [ ] **FE** Explicar impacto da configuração e prever prévia antes de aplicar.
- [ ] **DECISÃO** Aprovar inventário do primeiro lote de páginas, blocos e campos editáveis.
- [ ] **DECISÃO** Definir quem pode criar, revisar, publicar, agendar, arquivar e restaurar cada tipo de conteúdo.
- [ ] **BACKEND** CMS, persistência/versionamento, mídia, publicação e rollback são contratos futuros.

**Gate E:** jornada editorial completa e compreensível, sem liberar HTML, CSS, JS ou publicação real.

### 18.7 Fase F — imóveis e reservas em consulta (P1)

- [ ] **FE** Listar imóveis demonstrativos com origem, completude editorial, estado e atualização.
- [ ] **FE** Diferenciar cadastro editorial da autoridade sobre tarifa, disponibilidade e reserva.
- [ ] **FE** Criar busca e filtros simples para o catálogo, com vazio e nenhum resultado.
- [ ] **FE** Criar lista de reservas com referência mascarada, imóvel, estadia, status da fonte, origem/atribuição e atualização.
- [ ] **FE** Criar detalhe somente leitura que identifique fonte, status, sincronização e divergência.
- [ ] **FE** Minimizar dados: fixtures de reserva sem nome, email, telefone, CPF, pagamento ou endereço.
- [ ] **FE** Converter tabela em cartões móveis com rótulos explícitos e sem perda dos dados essenciais.
- [ ] **FE** Prever filtros por período, imóvel, status e origem e manter os filtros ao voltar do detalhe.
- [ ] **FE** Indicar amostra, paginação, carregamento, erro, atraso e fonte indisponível.
- [ ] **FE** Não criar botão de editar/cancelar/confirmar, alterar hóspede, cobrança ou disponibilidade.
- [ ] **FE** Manter lista de entrega/“whitelist” fora do MVP até existir definição de destinatário, campos e mecanismo.
- [ ] **FE** Não prototipar compartilhamento de reservas com dados reais antes de definir destinatário, campos, formato, autenticação, expiração e revogação.
- [ ] **DECISÃO** Escolher se a primeira entrega contém apenas exploração visual inerte da lista de entrega ou se o fluxo fica adiado até as definições pendentes.
- [ ] **DECISÃO** Aprovar finalidade, destinatário, conteúdo, autenticação, expiração e revogação da futura lista de entrega.
- [ ] **BACKEND** Contrato read-only, autorização por campos e consultas Stays ficam para outra etapa.

**Gate F:** a interface nunca sugere autoridade sobre a fonte de verdade e não expõe dados pessoais desnecessários.

### 18.8 Fase G — afiliados, incluindo adicionar afiliado (P1)

#### Lista e ciclo de vida

- [ ] **FE** Criar lista de afiliados com nome público, identificador interno fictício, tipo, estado cadastral, estado de acesso e última atualização.
- [ ] **FE** Separar estado do cadastro, análise, contrato/comercial, convite, acesso e situação de pagamento.
- [ ] **FE** Criar busca, filtros, ordenação, paginação, vazio e detalhe do afiliado.
- [ ] **FE** Mostrar histórico cronológico com ator, data/hora, ação, motivo e resultado demonstrativos.
- [ ] **FE** Distinguir afiliado potencial, inscrição recebida, análise, aprovado, recusado, aguardando informações, suspenso e arquivado.
- [ ] **FE** Distinguir convite não enviado, pendente, aceito, expirado, revogado e conta ativa/suspensa.
- [ ] **FE** Exigir motivo demonstrativo para recusa, suspensão ou encerramento.

#### Adicionar afiliado manualmente

- [ ] **FE** Incluir ação primária “Adicionar afiliado” na lista e explicar para que serve adicionar manualmente versus receber uma inscrição.
- [ ] **FE** Criar formulário em etapas curtas com cabeçalho de progresso e opção de salvar rascunho local/cancelar.
- [ ] **FE** Capturar apenas dados definidos para o protótipo: nome público/empresa, tipo de parceiro, contato de trabalho fictício, canal de divulgação e observações internas fictícias.
- [ ] **FE** Não solicitar documentos, dados bancários, fiscais ou credenciais no protótipo.
- [ ] **FE** Apresentar aviso de privacidade/uso dos dados em linguagem simples e campo de origem do cadastro.
- [ ] **FE** Validar obrigatoriedade, formato, limites e erros junto aos campos; preservar entrada ao corrigir erro.
- [ ] **FE** Demonstrar alerta de possível duplicidade usando fixtures sintéticas, sem revelar registro além das permissões fictícias.
- [ ] **FE** Permitir escolher “salvar para análise” ou “salvar como rascunho” no protótipo, sem aprovar automaticamente.
- [ ] **FE** Revisar resumo antes da confirmação: dados incluídos, estado inicial, responsável e próxima etapa.
- [ ] **FE** Confirmar sucesso e fornecer link para o detalhe recém-criado.
- [ ] **FE** Permitir cancelar sem perder a lista/filtros e explicar descarte de rascunho local.
- [ ] **FE** Definir ciclo de vida do rascunho demonstrativo: editar, retomar, descartar, confirmar descarte e limpar estado local; não persistir dados pessoais no navegador.
- [ ] **FE** Projetar estados de erro, repetição de envio e prevenção visual contra duplicação por toque repetido.
- [ ] **FE** Rotular claramente que cadastro e convite são inertes e locais nesta fase.

#### Análise, aprovação e acesso

- [ ] **FE** Desenhar fila de triagem e detalhe de solicitação com origem, data, responsável e informações mínimas.
- [ ] **FE** Desenhar pedir informação, aprovar, recusar e arquivar, exigindo revisão/resumo e motivo quando aplicável.
- [ ] **FE** Manter aprovação comercial separada de criação de usuário e envio de convite.
- [ ] **FE** Desenhar convite como operação própria: destinatário, papel de afiliado, validade, estado e reenvio/revogação demonstrativos.
- [ ] **FE** Não mostrar token/link secreto em log ou lista; protótipo deve usar link fictício/inoperante.
- [ ] **FE** Desenhar suspensão/reativação e revogação de acesso com impacto, confirmação e motivo.
- [ ] **FE** Mostrar que acesso de afiliado limita os dados ao próprio perfil e resultados.

#### Desempenho e regras comerciais

- [ ] **FE** Criar resumo de cliques, visitas, leads, reservas atribuídas e comissão somente como categorias distintas.
- [ ] **FE** Exibir método, janela, fonte, atualização, cobertura e estado “pendente de atribuição”.
- [ ] **FE** Fazer filtros de período, afiliado, canal e status combinarem de modo previsível, com contagem, limpar filtros e vazio sem correspondência.
- [ ] **FE** Não chamar valor estimado de comissão aprovada, nem reserva atribuída de faturamento conciliado.
- [ ] **FE** Prever ajuste/contestação como estado explicativo sem ação financeira.
- [ ] **DECISÃO** Definir modelo de parceria, elegibilidade, canal, janela, atribuição, deduplicação, cancelamento e regras comerciais.
- [ ] **DECISÃO** Definir se cadastro pode ser iniciado por equipe, por formulário externo ou por ambos.
- [ ] **DECISÃO** Definir campos mínimos e canal de convite oficial.
- [ ] **BACKEND** Identidade, convite, isolamento por afiliado, atribuição, auditoria e comissão reais permanecem fora deste Goal.

**Gate G:** qualquer pessoa da equipe entende a diferença entre adicionar, aprovar, convidar, ativar, suspender e pagar; nenhum desses atos ocorre de verdade no protótipo.

### 18.9 Fase H — integrações, administração, acesso e auditoria (P1/P2)

- [ ] **FE** Mostrar por serviço: estado de conexão, estado de sincronização, última atualização, atraso e falha.
- [ ] **FE** Usar mensagens de erro úteis sem revelar segredos, payloads pessoais ou detalhes internos perigosos.
- [ ] **FE** Marcar claramente controles sem ação real; não adicionar sincronização genérica.
- [ ] **FE** Criar página demonstrativa de usuários internos, status, papel, último acesso e convite pendente.
- [ ] **FE** Criar visualização de permissões por área/ação em linguagem operacional, distinguindo acesso a dados pessoais e exportação.
- [ ] **FE** Separar configurações editoriais do site de configurações administrativas do portal.
- [ ] **FE** Agrupar configurações administrativas em perfil, preferências, equipe/acessos, notificações e segurança informativa, sem expor segredos.
- [ ] **FE** Criar eventos de auditoria demonstrativos e filtros por pessoa, ação, área, período e resultado.
- [ ] **FE** Distinguir log de atividade do produto e eventos fornecidos pelo provedor de identidade.
- [ ] **FE** Projetar estado sem permissão, acesso negado, sessão expirada e recurso indisponível sem dados sensíveis no texto.
- [ ] **FE** Desenhar exportação de auditoria apenas como protótipo visual com escopo, período e aviso; não gerar arquivo real.
- [ ] **DECISÃO** Definir papéis internos, matriz de separação de funções, revisores de acesso e periodicidade da revisão.
- [ ] **DECISÃO** Definir política real de MFA, sessão, recuperação e conta de emergência antes de autenticação.
- [ ] **BACKEND** Enforcement, logs imutáveis, retenção, MFA, ciclo de credenciais e exportação real dependem de desenho técnico posterior.

**Gate H:** usuários entendem o que cada estado quer dizer e não confundem observabilidade com controle de fornecedor.

### 18.10 Fase I — acabamento, responsividade e qualidade transversal (P0/P1)

- [ ] **FE** Validar todas as telas em desktop, tablet e viewport móvel de referência.
- [ ] **FE** Registrar viewports, navegadores, zoom e roteiro de inspeção visual; cobrir orientação e teclado virtual em formulários.
- [ ] **FE** Verificar links externos, abertura de nova aba, voltar/avançar, rota direta e recuperação após refresh.
- [ ] **FE** Confirmar que fixtures, buscas, filtros e estado local não usam dados reais e que a demonstração pode ser reiniciada previsivelmente.
- [ ] **FE** Definir o comportamento de cada controle visível: navegação, mudança de estado demonstrativo, desabilitado ou planejado; remover ações decorativas sem resposta.
- [ ] **FE** Validar textos extensos, nomes longos, imagens ausentes/com erro, formatação de moeda/data/fuso e paginação.
- [ ] **FE** Validar zoom de texto, orientação, teclado virtual, áreas seguras e rolagem longa.
- [ ] **FE** Validar navegação completa por teclado, ordem de foco, retorno de foco e ausência de armadilha.
- [ ] **FE** Associar labels, descrições e erros a todos os campos; nomear todos os botões de ícone.
- [ ] **FE** Verificar headings semânticos, landmarks, tabelas com cabeçalhos e diálogos com nome/modalidade corretos.
- [ ] **FE** Verificar que ação sensível não depende de hover, swipe, arrasto, cor ou precisão de toque.
- [ ] **FE** Verificar preferência de movimento reduzido e não usar animação como sinal exclusivo.
- [ ] **FE** Revisar linguagem: direta, em português brasileiro, com explicação de origem, atualização e limite de autoridade.
- [ ] **FE** Revisar consistência entre rótulos do menu, breadcrumb, título, botão, toast e estado final.
- [ ] **FE** Validar todos os estados por tela: inicial, carregando, vazio, filtrado sem resultado, erro, parcial, desatualizado, sucesso e acesso negado conforme aplicável.
- [ ] **FE** Verificar que nada do portal altera `Header`, checkout, conta, proprietário, rotas públicas ou contratos existentes.
- [ ] **FE** Executar lint, build, testes dirigidos quando comportamento novo justificar, e inspeção de diff.
- [ ] **FE** Registrar limitações conhecidas e distinguir avisos preexistentes de falhas introduzidas.
- [ ] **FE** Fazer revisão visual final com um conjunto de telas representativo e dados sintéticos.
- [ ] **FE** Conferir logs, console e rede durante a revisão para confirmar ausência de chamadas de escrita, credenciais e erros não tratados.
- [ ] **FE** Fazer revisão de regressão nas rotas/estilos do portal e comparar o site público quando houver alteração compartilhada.
- [ ] **FE** Criar rastreabilidade: cada requisito das seções funcionais, papéis, experiência, métricas, segurança, aceite e riscos aponta para tela, decisão, etapa futura ou adiamento justificado.

**Gate I:** nenhuma jornada central termina em tela sem saída, estado ambíguo ou promessa operacional falsa.

### 18.11 Ordem de implementação recomendada

1. [ ] Tokens, logo, tipografia e componentes-base.
2. [ ] Shell desktop/mobile e navegação isolada.
3. [ ] Visão geral com fontes demonstrativas e estados.
4. [ ] Lista de páginas, editor estruturado, prévia e fluxo de revisão inerte.
5. [ ] Configurações editoriais do site, com impacto e prévia.
6. [ ] Catálogo demonstrativo de imóveis.
7. [ ] Reservas somente leitura com layout mobile em cartões.
8. [ ] Afiliados: lista, adicionar, detalhe, análise, convite e desempenho demonstrativos.
9. [ ] Integrações e administração/acessos demonstrativos.
10. [ ] Revisão transversal de acessibilidade, visual, responsive, estados e regressões.

Não iniciar todas as telas em paralelo antes de aprovar shell, tokens e contratos dos componentes-base. Após a fundação, dividir tarefas por domínio e propriedade de arquivos; um agente líder integra e revisa tudo.

### 18.12 Critério final de conclusão do front-end

- [ ] As fases priorizadas foram concluídas ou explicitamente adiadas com justificativa.
- [ ] Cada tela implementada atende aos itens relevantes deste checklist e tem loading/empty/error/success conforme necessário.
- [ ] A identidade visual reconhece a Central de Reservas e reutiliza o design system sem modificar o site público.
- [ ] A jornada de adicionar afiliado está prototipada, incluindo validação, resumo, estado inicial e conclusão inerte.
- [ ] A administração interna distingue perfil, acessos, configuração editorial e segurança demonstrativa.
- [ ] Nenhum dado real ou integração operacional foi usado para dar aparência de completude.
- [ ] Critérios técnicos e de acessibilidade foram verificados e registrados.
- [ ] Pendências de decisão e dependências de backend estão listadas separadamente do que o front-end entregou.
- [ ] Análises, lista de entrega, busca/notificações, acessos/histórico e sobreposição com administração existente foram cobertos ou adiados com justificativa.
- [ ] Todos os controles visíveis têm comportamento demonstrativo claro ou estão identificados como planejados/desabilitados.

## 19. Próximos passos e bloqueios de produto

O checklist permite executar o front-end com fixtures enquanto decisões operacionais permanecem pendentes. Antes de conectar qualquer dado ou ação real, resolver especialmente: papéis internos; inventário editorial; regras de cadastro e aprovação de afiliados; identidade/convite; atribuição e comissão; fontes de métricas; campos de reservas; política de acesso e auditoria; e a relação formal com a administração existente de proprietários.

### 19.1 Auditoria de cobertura da proposta

Antes de considerar o checklist completo, conferir requisito por requisito das seções de escopo funcional, papéis, experiência desktop/mobile, métricas, segurança, fases, aceite, riscos e decisões abertas. Cada requisito deve apontar para tela/jornada e critério de aceite, decisão de produto, dependência futura de backend ou adiamento deliberado com justificativa. A cobertura não transforma automaticamente toda capacidade futura em obrigatoriedade do primeiro MVP.

Na revisão atual, análises de negócio e tarifas por data passaram a ter cobertura explícita na fase D. A lista de entrega de reservas permanece condicionada à decisão sobre destinatário, formato, dados e compartilhamento. Busca global, notificações, convites, gestão de equipe, sessões e auditoria devem ser classificados como MVP, protótipo inerte ou etapa futura, sem controles que pareçam operacionais quando não são.

