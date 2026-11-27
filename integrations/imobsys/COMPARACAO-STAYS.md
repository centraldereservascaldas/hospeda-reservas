# Comparação da API de imóveis: Stays e ImobSys

Esta análise descreve os contratos observados no repositório, não uma API oficial da ImobSys. A integração fica isolada e não altera o site publicado.

| Etapa | Stays no site | ImobSys no serviço isolado | Consequência |
| --- | --- | --- | --- |
| Busca | Resposta com `success`, `source`, `total`, datas, hóspedes, `data`, `meta` e `pagination` | `/api/v1/accommodations/search` adapta a consulta autenticada ao mesmo envelope | Origem é `imobsys-live`; não deve ser enviada ao adaptador Stays. |
| Identidade | ID e IDs específicos da Stays | ID composto `imobsys-crcn-base-referência` | O roteamento precisa preservar fornecedor e identidade completa. |
| Disponibilidade | Pesquisa e verificação novamente antes da reserva | Oferta observada no painel autenticado para datas e hóspedes | Oferta não garante bloqueio de estoque; revalidar antes de reservar. |
| Valor | Cotação retorna total e, quando disponíveis, componentes | O painel fornece o total Pix; não comprova composição das taxas | O total não deve ser somado novamente nem decomposto por suposição. |
| Fotos e detalhes | Catálogo Stays fornece dados do anúncio | Fotos identificadas separadamente por referência e base | Não substituir fotos entre imóveis nem inventar atributos ausentes. |
| Pré-reserva | Serviço do site cria e acompanha pedido Stays | Operação de fornecedor observada, sujeita a validação e conferência do contrato | Uma resposta incerta não pode ser repetida automaticamente. |
| Pagamento | Checkout próprio com Cielo, conciliação e estados persistentes | Orquestração isolada em sandbox, com fila para vendedor | Ainda falta interface segura no navegador e tratamento completo de expiração e confirmação. |

## Simulação

Os testes `accommodation-search.test.mjs`, `partner-checkout-flow.test.mjs` e `simulated-checkout-journey.test.mjs` simulam respectivamente o envelope de busca, a sequência cotação → pré-reserva → Cielo → fila e respostas incertas. As reservas e os pagamentos desses testes são substituídos por funções de teste: eles não demonstram uma compra real nem uma jornada completa no navegador.

O envelope segue a estrutura da resposta de busca Stays, mas mantém `imobsys-live` e campos desconhecidos como `null`. Não declarar disponibilidade garantida, preço por diária, taxa de limpeza ou capacidade quando o fornecedor não os comprovar. A adaptação ainda não cobre todos os campos exigidos pela interface `Property` nem permite publicar os imóveis automaticamente.
