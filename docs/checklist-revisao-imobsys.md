# Checklist da revisão da integração ImobSys

Base: comentários de revisão do PR #77 sobre a branch `codex/imobsys-integration-completion` e o PR complementar da API do Diogo #11. A integração permanece experimental; este checklist não autoriza ativação.

- [x] Impedir a finalização do pagamento manual se o valor observado do fornecedor estiver ausente ou divergir do valor informado; manter o pedido na fila.
- [x] Cobrir valor exato, menor, maior e desconhecido nos testes de pagamento manual.
- [x] Exercitar paginação combinada em destino não verificado com resultados Stays filtrados, duas páginas da Stays e transição para a ImobSys. A busca por destino com parceiro habilitado varre as páginas Stays e pagina depois de filtrar; sem parceiro, o comportamento existente da busca Stays não foi alterado.
- [x] Preservar os resultados Stays quando o parceiro falhar e indicar falha ao tentar avançar além deles; cobrir esse cenário e o limite de varredura.
- [ ] Cobrir alteração de resultados entre páginas e avaliar snapshot de resultados para evitar pulos ou repetição quando o inventário mudar.
- [ ] Validar a rolagem infinita no navegador, inclusive erro, nova busca, filtros, teclado, tela pequena e repetição de pedidos. Na busca, a página continua usando a paginação do backend; no catálogo inicial, a apresentação é incremental sobre os dados já carregados.
- [x] Conferir a existência do contrato `/v1/offers`, `/v1/pre-reservations` e consultas por operação e chave na API complementar; OpenAPI em `integrations/api-do-diogo/src/openapi.mjs`, com detalhes em `integrations/api-do-diogo/API.md`.
- [ ] Executar testes de contrato entre o Laravel e o gateway real da API isolada, incluindo autenticação, paginação, timeout, concorrência, replay e divergência de dados. Testes simulados de cada lado não demonstram integração real.
- [ ] Validar em ambiente autorizado uma pré-reserva ativa vinculada à operação persistida, com unidade, datas, hóspedes, preço e condições adicionais confirmados. Não criar reservas reais durante este trabalho.
- [ ] Comprovar a origem e completude dos dados de devolução/estorno da Cielo e testar falhas e compensações após pagamento confirmado.
- [ ] Revisar monitoração, segurança, recuperação operacional, deploy e rollback antes de qualquer pedido de ativação.

O checkout e a fila são restritos a ambiente de teste e continuam sujeitos a flags. O fornecedor ainda responde com disponibilidade, hóspedes e encargos não confirmados; isso impede iniciar cobrança no fluxo experimental.
