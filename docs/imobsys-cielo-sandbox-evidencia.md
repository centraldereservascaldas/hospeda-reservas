# Cielo sandbox — evidência de testes isolados

Executado em 26/11/2026 usando credenciais de sandbox disponíveis no ambiente local e somente endpoints sandbox. Nenhuma credencial, token, QR Code ou dado real de cliente foi salvo neste registro.

- Pix: criação de R$ 523,00 com identidade fictícia; a Cielo retornou código Pix e identificador. Consulta posterior confirmou o identificador do pedido, o valor e status 12 (pendente). A documentação da Cielo informa que o Pix do sandbox permanece pendente: https://docs.cielo.com.br/ecommerce-cielo/reference/como-usar-o-sandbox.
- SOP: autenticação OAuth retornou 200 e a emissão de token de acesso ao navegador retornou 201. Dados de cartões fictícios foram preenchidos em página local isolada e encaminhados pelo script SOP diretamente à Cielo; o servidor local recebeu somente o PaymentToken.
- Cartão: usando o provedor simulado da Cielo e valor de R$ 600,00 em seis parcelas, houve um teste com status 2 (confirmado) e outro com status 3 (negado). Consulta posterior confirmou o identificador do pedido e o valor. Números de teste, validade e CVV eram fictícios. Regras do provedor simulado: https://docs.cielo.com.br/ecommerce-cielo/reference/credito-sandbox.

Os testes acima exercitaram o cliente Cielo e um formulário isolado, não o checkout completo do site. Não consultaram ou criaram reserva na ImobSys, nem demonstram a integração entre pagamento e pré-reserva. O resultado também não comprova credenciais de produção, antifraude ou autorização para liberar vendas. A reserva e o pagamento da integração de parceiros continuam desativados até o restante da validação e revisão.
