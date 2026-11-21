# Consulta de reservas no painel ImobSys

Observação realizada no painel autenticado em 20/11/2026, somente leitura. A página `/hospedagem/busca` possui filtros de tipo, período, unidade, situação, financeiro, origem e corretor. O botão Buscar chama a ação `hospedagem/buscaListaHospedagem` pelo mecanismo Ajax do painel. A tabela apresenta código, unidade, entrada, saída, cliente, valores e tipo; a coluna do código contém um link para `/hospedagem/{id}`.

Essas rotas e ações são do painel de terceiros, não são uma API oficial documentada. Os dados incluem informações pessoais e financeiras. A resposta e a autenticação devem ser protegidas e jamais expostas no frontend público ou registradas em logs.

Ainda não há endpoints novos para listar ou detalhar reservas no conector. Para implementá-los, é necessário estender o executor autenticado com trabalhos específicos de leitura, validar filtros e paginação, definir autorização para a equipe, limitar os campos retornados e testar falhas de sessão e respostas inesperadas. Não reutilizar a política de consulta de disponibilidade para permitir ações indiscriminadas no painel.
