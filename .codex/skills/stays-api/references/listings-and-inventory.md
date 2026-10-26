# Imóveis, anúncios e inventário

Use para localizar ou manter cadastro de propriedade/condomínio, anúncio/unidade, cômodos, grupos de anúncios, comodidades e dados auxiliares. Consulte o schema de cada operação antes de alterar cadastro.

## Resolver a entidade correta

- Primeiro pesquise `GET /content/listings` e `GET /content/properties` com filtros documentados. Use IDs retornados pela conta; título, nome interno ou localização são pistas de busca, não identificadores estáveis.
- Anúncio representa a unidade comercializável; propriedade representa o imóvel/condomínio associado. Leia `GET /content/listings/{listingId}` e use `_idproperty` para resolver `GET /content/properties/{propertyId}`.
- Para quartos, use `/content/listing-rooms/{listingId}` e as rotas de detalhe correspondentes. Confirme associação com o anúncio antes de criar ou remover um cômodo.
- Preserve campos desconhecidos durante um PATCH. Não envie um objeto GET inteiro de volta sem verificar o schema de escrita: campos read-only ou derivados podem ser rejeitados ou alterados.

## Alterações de conteúdo

- Antes de `POST` ou `PATCH` em listings/properties/rooms, confira IDs, idiomas, enums e campos obrigatórios no OpenAPI. Registre o estado atual necessário para comparar.
- Após gravar, faça GET do recurso e confira campos alterados, relações e status de publicação/visibilidade, quando documentados.
- Exclusões de cômodos, grupos, membros de grupo ou anúncios têm impacto em conteúdo relacionado. Confirme o alvo e dependências; não assuma cascata ou restauração.
- Upload de imagem/arquivo pode publicar ou associar conteúdo e pode ter efeitos além da leitura. Confira formato, tamanho, resposta e endpoint de associação antes de enviar.

## Grupos e vocabulários

- `clone-groups` controla grupos clonados e seus membros/visibilidade; `price-groups` agrupa anúncios para configuração de preços. Não confunda esses recursos. Leia grupo e membros antes de editar e verifique cada associação depois.
- Endpoints `/translation/*` fornecem vocabulários como tipos, comodidades, camas, inventário e tags. Prefira valores já fornecidos pelo catálogo da conta. Algumas entradas são gerenciadas pela Stays e podem ser somente leitura; siga flags e descrição do schema.
- Use `statistics/active-listings-history` para histórico de atividade se a pergunta for sobre evolução temporal. Não infira situação atual de um registro histórico.
