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
