# Ciclo diário de anúncios

Playbook acionado por “subir anúncio”, “criar acomodação”, “verificar anúncio”, “está completo?”, “atualizar anúncio”, “trocar fotos”, “ativar” ou “publicar”. Use os schemas atuais em `endpoint-catalog.md` e `stays-openapi.json`; o catálogo resume, mas não substitui o contrato.

## 1. Descobrir o alvo e o tipo de trabalho

- Diferencie **property** (endereço/condomínio) de **listing** (unidade anunciada). Um listing pode apontar para `_idproperty`; para unidade independente, o guia API prevê `_idpropertyType` no lugar. Confirme isso antes do cadastro.
- Resolva o recurso com `GET /content/listings` ou `GET /content/properties`, usando `quicksearch`, `propertyId`, `status`, `skip` e `limit` documentados. IDs curtos e longos são aceitos nas rotas de detalhe conforme OpenAPI.
- Para “subir” pergunte se é novo ou já existe em rascunho. Para “atualizar” ou “verificar”, não duplique: procure candidatos, confirme nome interno/endereço e leia o detalhe.
- Importar anúncio existente de Airbnb/OTA é fluxo de conexão do channel manager descrito no painel, não operação evidente no snapshot da External API. Não substitua por criação de listing nem tente mapear OTA via endpoint de conteúdo.

## 2. Cadastrar um novo anúncio

1. Confira se a propriedade já existe. Se não, obtenha tipo e demais vocabulários em `/translation/*` e crie property com `POST /content/properties` conforme schema.
2. Crie o listing com `POST /content/listings`. O snapshot exige `internalName`, `_idtype` e `subtype`; confirme ainda o vínculo correto `_idproperty` **ou** o tipo de propriedade independente `_idpropertyType` conforme documentação do endpoint. Não invente os demais campos nem assuma que criar o listing preenche conteúdo completo.
3. Cadastre e revise cômodos/camas/inventário por `/content/listing-rooms/{listingId}`. Confirme tipos e IDs no catálogo `/translation/` antes de enviar.
4. Complete conteúdo da property e do listing separadamente: nome/título, descrição por idioma, localização/endereço e amenidades no nível correto. O schema da conta define quais campos são aceitos.
5. Faça upload de imagens com `POST /content/upload-images` (multipart `images`), guarde os IDs retornados em memória e associe-os por PATCH ao recurso/cômodo correto. Upload sozinho pode apenas criar arquivos; releia o listing/room e confirme associação/ordem.
6. Leia configurações e prontidão: `/settings/listing/{listingId}/booking`, `/sellprice`, `/house-rules`; leia o calendário para o período aplicável.
7. Deixe como draft enquanto conteúdo/preço/conectividade estiverem em revisão. Antes de ativar, prepare uma lista de campos e consequências, incluindo a limitação sobre canais abaixo, e peça confirmação explícita.

Não assuma que uma resposta 201 significa anúncio completo ou publicado. Releia property, listing, cômodos e configurações criados.

## 3. Verificar se um anúncio está pronto

Leia e cruze os dados, sem alterar:

| Área | O que conferir | Origem provável |
|---|---|---|
| Identidade | ID curto/longo, nome interno, status e relação property/listing | `GET /content/listings`, `GET /content/listings/{listingId}` |
| Endereço | endereço/localização e propriedade associada | `GET /content/properties/{propertyId}` |
| Conteúdo | título/descrição/locales, capacidade e demais campos documentados | listing/property details; confirme schemas da conta |
| Comodidades | amenities do endereço vs amenities da unidade; IDs válidos e itens disponíveis para canais | conteúdo property/listing; `GET /translation/property-amenities`, `/listing-amenities` |
| Quartos e camas | tipo do cômodo, contagem/configuração de camas, fotos e inventário | `GET /content/listing-rooms/{listingId}` e detalhe de cada room |
| Fotos | imagens associadas ao listing e a cada room, ordem/IDs se expostos | listing/room; o upload isolado não prova associação |
| Regras | hóspedes/crianças/pets, política, horários, regras da casa | booking settings e house-rules |
| Preço | modelo da conta, configuração de venda do anúncio, temporada/tarifa se aplicável | global pricing-model, listing sellprice, `/parr/*` |
| Calendário | disponibilidade, tarifa preenchida, mínimo/restrições e datas fechadas | `GET /calendar/listing/{listingId}?from&to` |
| Publicação | status Stays, visibilidade no site, conexão/mapeamento e estado por canal | status e `otaChannels` se vierem no detalhe do listing; painel/channel manager ou fonte específica da OTA para confirmar sincronização |

Classifique cada item como **confirmado**, **ausente**, **inconsistente** ou **não verificável pela External API**. Não dê nota única “pronto” quando conectividade, critérios de canal ou campos obrigatórios dependem da conta/OTA e não aparecem no schema.

### Interpretar status do anúncio

A Stays Academy descreve `draft` como cadastro em andamento; `active` como acomodação pronta para receber reservas; `hidden` como disponível em canais mas oculto do site público Stays; `inactive` como fora do portfólio. Confirme enum/status no OpenAPI e semântica atual na conta. A ativação pode tornar o anúncio elegível à venda, mas não prova que haja mapeamento ativo em Booking/Airbnb nem que o canal recebeu a atualização. Leia `otaChannels` se presente, mas só considere sincronização confirmada quando o status exposto significar isso; caso contrário confira painel ou fonte da OTA. A orientação oficial indica desconectar canais antes de inativar.

## 4. Atualizar cadastro ou conteúdo

- Primeiro leia o recurso atual. Faça PATCH só com os campos que o usuário pediu e cujos nomes/tipos são aceitos no schema. Não reenvie resposta GET inteira; campos derivados/read-only podem produzir efeitos inesperados.
- Determine se o campo pertence ao endereço/property, anúncio/listing ou room. Amenity de área comum vai para property; amenity individual vai para listing, conforme organização da Stays.
- Para imagem nova, faça upload e associação. Para substituir/remover, mostre quais IDs/fotos existentes serão removidos e peça autorização explícita.
- Depois do PATCH, faça GET e apresente comparação antes/depois dos campos alterados, sem divulgar dados privados desnecessários.

## 5. Calendário, preço e disponibilidade

- Confirme o modelo ativo: preço por noite usa calendário; preços por período/temporada usam `/parr/seasons-sell` e `/parr/listing-rates-sell` segundo o FAQ da Open API. Verifique `GET /settings/global/pricing-model` e configurações por anúncio antes de editar.
- Use `GET /calendar/listing/{listingId}` para janela concreta. Altere datas/valores/restrições só pelos PATCH documentados em `calendar-and-pricing.md`.
- Para conferir “por que não vende”, cheque além do status: calendário e disponibilidade, preços, regras de estadia, booking settings, conteúdo requerido por canal e conexão/mapeamento. Apresente o que a API confirma e o que requer checagem no painel/canal.

## 6. Confirmação antes de ativar ou alterar em massa

**Sempre pare e peça confirmação explícita após apresentar o plano concreto quando a ação:**

- criar/publicar/ativar ou alterar visibilidade de anúncio;
- atualizar múltiplos anúncios, imóveis ou quartos em lote;
- remover/substituir fotos existentes ou apagar conteúdo;
- editar regras de preço globais, grupos, temporadas ou calendário em muitos dias/anúncios;
- afetar sincronização de canais de venda ou desconectar/inativar anúncios;
- alterar dados com impacto jurídico/comercial, como regras da casa, contrato ou política de reserva.

O plano deve identificar IDs/nome interno dos alvos, número de recursos afetados, campos/datas e valores antes/depois, eventual efeito externo e itens não verificados. Confirmação genérica antiga não vale para escopo que ainda não estava definido. Após a escrita, releia cada recurso afetado; interrompa se houver divergência.

Para PATCH pontual e totalmente especificado, a instrução direta pode autorizar a ação; confirme o alvo e o campo sem criar um rito desnecessário. Se houver dúvida de identidade, valor, alcance ou consequência, pergunte primeiro.

## Fontes oficiais para fluxo de painel

- [Como criar um anúncio na Stays](https://academy.stays.net/pt-BR/support/solutions/articles/36000229907-como-criar-um-anuncio-na-stays/): cadastro do zero ou importação via Airbnb e hierarquia property → listing.
- [Status de acomodação](https://academy.stays.net/pt-BR/support/solutions/articles/36000000965-quais-status-uma-acomodacao-pode-ter/): draft, active, hidden, inactive e dependência de canais.
- [Cadastro de amenities](https://academy.stays.net/pt-BR/support/solutions/articles/36000118895-como-cadastrar-amenities-nos-meus-anuncios-da-stays/): distinção de amenities da propriedade e acomodação e compatibilidade dos canais.
- [Fotos por cômodo](https://academy.stays.net/pt-BR/support/solutions/articles/36000168243-como-cadastrar-fotos-de-um-comodo-em-anuncios-stays/): associação de fotos por quarto e arredores.
- [Período de disponibilidade](https://academy.stays.net/pt-BR/support/solutions/articles/36000109010-como-configurar-o-periodo-de-disponibilidade-na-stays/): limite de antecedência e escopo global ou por anúncio.
- [Preparar calendário](https://academy.stays.net/pt-BR/support/solutions/articles/36000247894-3-prepare-seu-calendario): prontidão do calendário antes de conectar canais.
- [Monitorar tarifas enviadas aos canais](https://academy.stays.net/pt-BR/support/solutions/articles/36000108536-como-monitorar-os-precos-de-diarias-enviados-aos-canais-de-venda/): conferência pelo painel.
- [Mapear anúncio Booking](https://academy.stays.net/pt-BR/support/solutions/articles/36000094118-como-vincular-mapear-anuncios-booking-na-stays/): conexão/mapeamento fora das rotas de conteúdo da External API.
- [API Reference oficial](https://stays.net/external-api/): contratos gerais de upload, conteúdo, listing e quartos; o snapshot da conta continua prioritário para a conta CRCN.
