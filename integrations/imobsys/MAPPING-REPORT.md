# Mapeamento ImobSys — 18/11/2026

## Escopo isolado
Consultas públicas de leitura. Nenhuma reserva, bloqueio, cobrança ou alteração no site existente.

## Cobertura observada
- 40 condomínios no sitemap.
- 314 referências únicas das bases 1, 31.
- 18 períodos consultados; amostragem até junho de 2027.
- Matriz por imóvel e período em data/coverage.json, acessível em GET /api/coverage.
- O catálogo é a união de ofertas observadas, não uma listagem administrativa completa.

## O que a disponibilidade significa
A presença na resposta de Controller=precos, action=listaprecos significa oferta publicada para o período e preço observado, sem reserva ou garantia de estoque. Ausência significa desconhecido, nunca ocupado. Erros do fornecedor significam falha de consulta, nunca indisponibilidade.

Nas três buscas de uma noite não vieram ofertas para nenhum imóvel. Datas a partir de março também vieram vazias. Esses resultados não permitem distinguir ocupação, restrição de estadia ou ausência de tarifa. O mapa mensal público retornou três unidades, sem legenda verificável. Suas marcações continuam desconhecidas, inclusive dias em branco.

## Limites para integração comercial
Não existe até agora um endpoint verificado que liste todas as unidades independentemente de tarifas, nem que devolva a situação diária explícita de cada referência da rede. A pesquisa pública não comprova disponibilidade definitiva e não deve autorizar cobrança isoladamente.

Para concluir catálogo e estoque: obter uma listagem administrativa/exportação autorizada de imóveis ativos e uma consulta explícita de disponibilidade/restrições por referência, ou identificar essas mesmas telas e suas requisições em uma sessão autorizada do fornecedor. Não enumerar IDs, não contornar autenticação e não usar criação de reserva para testar estoque.

## Atualização local
node scripts/map-catalog.mjs
node scripts/expand-coverage.mjs

Executar sequencialmente. Os arquivos data/ e .env ficam ignorados. O serviço não está conectado ao site de produção.

## Investigação adicional: calendário dos parceiros
Foram lidos os scripts públicos parceiro_1.1.21.js e global_1.1.18.js. Eles definem POST Controller=calendarioOcupacao, action=refDisplayNow, idUnidade e navegação por refPrev/refNext. Essa é uma consulta de calendário observada no frontend, mas não comprova suporte ao estoque remoto.

As páginas públicas já identificadas /parceiro/1/1149 e /parceiro/31/3 fornecem ImovRef e BaseConsulta, mas não fornecem idUnidade nem componente calendarioOcupacao. O mapa mensal também não forneceu a ligação dessas identidades. Nenhuma requisição com idUnidade vazio, inventado ou trocado pela referência do parceiro foi enviada. A ação reservarImovelParceiro, encontrada no JavaScript, foi apenas lida e nunca executada. Consultas de CPF, login e envio de formulários não foram executadas.

A página contém erros PHP em campos de formulário da reserva; isso não permite concluir que o catálogo está desativado. Nenhum campo com erro é usado como identidade ou preço.

## Preparação para o modelo do nosso site
Comando local: node scripts/stage-listings.mjs. Saída: data/staged-listings.json com 314 registros em contrato intermediário, ainda não conectado ao schema de produção. Identidade inclui fornecedor, base e referência; preço preserva período e origem; fotos ficam vazias até confirmar que são da unidade. activeConfirmed=false, published=false, disponibilidade desconhecida e capacidades de reserva/pagamento desligadas.

Próxima ligação necessária: uma tela/exportação autorizada que forneça o identificador de calendário de cada parceiro ou uma consulta remota explícita com base, referência, datas e restrições. As páginas públicas examinadas não expõem essa ligação. O adaptador do site deverá ser implementado somente depois de validar essa fonte, fotos de unidade, taxas e ciclo da reserva.

## Acesso administrativo autorizado — descobertas
Painel fornecido pelo usuário: https://app.reservascrcn.com.br/hospedagem/orcamentoRede, sessão já autenticada no Chrome. Foram usados apenas Buscar, Carregar mapa ocupação, navegação e Procurar no cadastro. Nenhum Alugar, Gerar Link, Salvar ou formulário de cliente foi enviado.

A consulta da rede observada no script hospedagem.1.2.77.js usa Controller=hospedagem, Action=getOrcamentoRede e filtros de entrada, saída, condomínio, capacidade, características e fornecedor via POST /Ajax.php. A função postAjax agrega contexto autenticado (Base, User, UserId, Token, Ambiente). Nenhum desses valores foi copiado para o conector nem incluído neste relatório.

A busca de 20–22/11/2026 exibiu 116 registros e referências de bases 1, 31 e 2. Base 2 é estoque interno adicional, não automaticamente publicável. Os contadores 116/406 e TotalRede:1.035 têm escopo ainda não verificado; não são usados como tamanho do catálogo.

A tela Receber Imóveis na Rede lista oito fornecedores. Somente cr e ca têm Exibir tudo site marcado. A configuração consultada de cr mostra acréscimo e desconto comerciais: preservar o valor final retornado, sem aplicar novamente o markup. Nenhuma configuração foi alterada.

O mapa administrativo retornou as mesmas três unidades de referência já presentes no mapa público, com legenda de pré-reserva, aluguel, manutenção e bloqueios. Isso não prova acesso ao calendário de todas as unidades remotas. A listagem Cadastro - Imóvel retornou um registro local com status explícito; não representa o catálogo dos fornecedores remotos.

## Restrição de estadia confirmada
Na pesquisa administrativa por unidade 00109, período 19–20/11/2026, o retorno explícito foi cr/tt/ca: Min de 2 Noites. Para 19–21/11/2026, houve uma oferta da base 1/ref 1149 de R$994,00 no Pix. O filtro de saída foi relido após a sugestão automática de datas para garantir que o período efetivo de uma noite fosse consultado. Evidência sanitizada em data/admin-evidence.json. Essa observação não autoriza inferir disponibilidade em outros períodos ou outras unidades.

A tentativa única de usar o nome getOrcamentoRede na API CNSP retornou método não mapeado; a rota administrativa e a API CNSP não são intercambiáveis. O token CNSP permanece somente no .env e não foi enviado ao painel administrativo.

## Fotos de unidades
O parser identifica galerias /fotos/{conta}/imoveis/{referencia}/fotos/, separadas de /condominios/. A associação é confirmada pelos campos ImovRef e BaseConsulta da página. Não inclui logos, marca de overlay ou imagens de domínios externos. A coleta percorre somente referências já conhecidas, em sequência, com intervalo de um segundo, cache de 24h e interrupção após cinco falhas consecutivas. Nenhum ID numérico é enumerado. URLs são armazenadas localmente sem espelhar todas as imagens. Duas fotos representativas das bases 1 e 31 responderam HTTP200 com Content-Type image/jpeg; isso não valida visualmente todas as fotos.

Coleta final de mídia: {"records":314,"withApartmentPhotos":314,"photoReferences":3701,"uniquePhotoUrls":3701,"errors":0,"stagedWithPhotos":314,"published":0}. As URLs foram identificadas nas galerias associadas às referências; validação visual de cada imagem e disponibilidade de entrega de todas as URLs ainda não realizadas. Não foram baixados ou publicados os arquivos de foto.

## Automação autenticada validada
Executor Playwright independente conectado à fila local. Sessão própria não persistente, login realizado pelo usuário, sem exportar credenciais do navegador habitual. Quatro consultas HTTP reais passaram: 00109 de 19 a 21/11/2026 (R$994 Pix), 00109 de 19 a 20/11 (mínimo2noites), rede de 20 a 22/11 (116ofertas, bases1/2/31) e D1003/4hóspedes (base2/ref772, R$1164Pix). Evidência sanitizada em data/admin-standalone-validation.json. Nenhuma reserva ou cobrança criada. O executor local continua dependendo de navegador/processo aberto e sessão válida; catálogo completo e calendário diário global ainda não comprovados.

## Prévia visual e ampliação por período
{
  "periods": 8,
  "networkReferences": 397,
  "mediaReferences": 398,
  "withApartmentImages": 397,
  "apartmentPhotoUrls": 4685,
  "preview": "http://127.0.0.1:8012/previa"
}
Amostragem autenticada: 20–22/11 (116), 27–29/11 (162), 04–06/12 (308), 11–13/12 (305), 18–20/12 (277), Natal 24–27/12 (121), Réveillon 31/12–03/01 (zero ofertas, estado desconhecido), janeiro 15–17/01 (323). Janeiro foi conferido na interface autenticada e normalizado com o mesmo parser, pois o executor precisou ser reiniciado para reconexão. Não declarar catálogo ou calendário diário completos.

Prévia local: identidade visual laranja/azul e vidro translúcido, logo, cartões de unidades, preço total no Pix para datas exatas, galeria, consulta ao vivo pelo executor e filtros locais. Conferidos desktop (1280px, quatro colunas) e celular (390px, duas colunas), sem overflow horizontal; modal com reserva desativada; período sem oferta não reaproveita preço de outra data. 35 testes passaram.

## Reconexão e prévia ao vivo validadas
Executor reconectado após login manual. Consultas reais HTTP200: janeiro15–17/01/2027 com322ofertas; 00109/19–20nov com mínimo2noites; 00109/4–6dez para4hóspedes com1oferta. No navegador da prévia, busca4–6dez/4hóspedes retornou301ofertas e F5 preservou datas, hóspedes e parâmetros, com nova consulta ao painel. Evidência sanitizada: data/reconnection-validation.json. Nenhuma reserva/cobrança. A diferença entre323 e322ofertas de janeiro é uma observação em instantes diferentes, não confirmação de estoque diário global.

## Pacote e branding alinhados ao site publicado
{
  "coverage": {
    "references": 399,
    "withUnitPhotos": 398,
    "curatedPeriods": 8,
    "rollingQueriesSucceeded": 14,
    "rollingQueriesFailed": 0,
    "catalogueComplete": false,
    "dailyOccupancyConfirmed": false
  },
  "rollingFrom": "2026-11-19",
  "rollingLastArrival": "2026-12-02",
  "branding": {
    "validatedAt": "2026-11-18T18:56:12.293Z",
    "source": "https://centraldereservascaldas.com/",
    "font": "Plus Jakarta Sans",
    "logo": "SVG copied from published header",
    "logoFramePx": 58,
    "ctaGradient": [
      "rgba(249,115,22,0.94)",
      "rgba(234,88,12,0.98)"
    ],
    "cardRadiusPx": 16,
    "cardPhotoAspect": "4/3",
    "desktopWidth": 1280,
    "mobileWidth": 390,
    "horizontalOverflow": false,
    "appliedOnlyTo": "imobsys-connector-lab"
  }
}
O pacote está em data/integration-candidates.json e o plano em data/integration-plan.json. Campos desconhecidos permanecem nulos. Não há diária artificial obtida pela divisão de um total com taxas desconhecidas. O validador do cliente atual aceita fontes Stays; a futura integração precisa fonte ImobSys explícita, cache e checkout por fornecedor. 39 testes passaram; conferidos fonte/SVG/gradiente/raios e layout em1280px/390px. Nenhum arquivo do site existente foi modificado.
