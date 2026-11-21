# Conector ImobSys — laboratório isolado

Serviço independente do Hospeda Reservas. Usa Node.js 22+ e HTTP direto, sem dependências externas, banco, Stays, Cielo ou alterações no site existente.

## Executar localmente

```powershell
node --env-file-if-exists=.env src/server.mjs
```

Acesse `http://127.0.0.1:8012`. Localmente, o serviço escuta em loopback. Em container, `HOST=0.0.0.0` permite tráfego na rede Docker; configure `IMOBSYS_ALLOWED_HOSTS` com os nomes internos exatos e mantenha domínio público e porta publicada desativados.

```powershell
node --test tests/*.test.mjs
```

Copie `.env.example` para `.env` para configurar uma porta e, opcionalmente, a credencial CNSP. Nunca versione `.env`. O diagnóstico usa a credencial somente no endereço fixo `https://api.cnsp.app/crcn`; ela não é enviada ao site público nem ao navegador local.

## Configuração de imóveis

`properties.json` contém referências configuradas manualmente. O inventário descoberto fica em `data/catalog.json`, separado dessa configuração e fora do versionamento. Ambos são usados pelo painel. As identidades preservam conta, base e referência; unidades de bases diferentes não são mescladas por nome.

### Mapear o inventário público

```powershell
node scripts/map-catalog.mjs
```

O comando lê o sitemap de condomínios e consulta a listagem pública de preços em seis períodos futuros, sequencialmente e com intervalo entre chamadas. Persiste a união de referências observadas, preços da última oferta e cobertura por período. Preserva registros anteriores e não transforma uma consulta com falha em catálogo vazio. O snapshot é escrito por substituição atômica.

**Não existe garantia de catálogo completo:** o sitemap enumera condomínios, não todas as unidades. A listagem enumera ofertas por data e pode omitir imóveis ocupados, desativados ou fora da rede visível. `catalogueComplete` permanece `false`. Não são enumeradas referências numéricas arbitrárias. A coleta de mídia consulta somente as referências já observadas no catálogo, sequencialmente, com cache e interrupção após falhas consecutivas.

O mapa de ocupação mensal é uma consulta separada. Suas unidades não são presumidas como todo o estoque de parceiros. Células com cor, transição e sem marcação são observações; sem legenda validada, todas continuam com `availability=unknown`.

## Consultas locais

- `GET /api/health`: saúde e modo somente leitura.
- `GET /api/properties`: referências locais configuradas.
- `GET /api/provider/status`: diagnóstico de autenticação CNSP; não descobre nem executa ações desconhecidas.
- `GET /api/catalog`: snapshot de condomínios, imóveis observados, cobertura e mapa mensal capturado.
- `GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`: ofertas encontradas no período, sem bloqueio ou confirmação de estoque.
- `GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD&propertyId=...`: identifica se a referência foi oferecida ou não foi observada. Ausência não é tratada como indisponibilidade confirmada.
- `GET /api/calendar?month=YYYY-MM`: unidades e marcações observadas no mapa público do mês.
- `GET /api/properties/{id}/details`: identificação da página pública.
- `GET /api/properties/{id}/quote?from=YYYY-MM-DD&to=YYYY-MM-DD`: oferta anunciada para o período.

Os POSTs de saída são restritos às consultas observadas no site: `Controller=parceiro/action=buscaPrecos`, `Controller=precos/action=listaprecos` e o formulário mensal de `/mapaocupacao`. Não são enviados cliente, CPF, `ALUGAR`, `ID_ORCA` ou ações de criação de reserva. Não existe endpoint local para executar ações arbitrárias. O sitemap é consultado por GET.

Falhas PHP do fornecedor podem retornar HTTP 200. O cliente as rejeita pelo corpo da resposta, sem expor caminhos internos e sem declarar estoque vazio.

Os destinos externos são fixos. Redirecionamentos são recusados. Há timeout de 20 segundos, tamanho máximo de resposta, limite de consultas, cache curto e limite de concorrência. O token nunca aparece nos retornos.

## Limites do resultado

A oferta é obtida do site público, não de uma API oficial documentada. O parser rejeita ofertas ambíguas, formatos inesperados e quantidade de noites divergente. Se o HTML mudar, a consulta falha sem inventar valores.

Retornos de preço sempre têm `availability=not-confirmed`, `guestCountVerified=false`, `feeBreakdownAvailable=false`, `bookingEnabled=false` e `paymentEnabled=false`. O período é enviado ao fornecedor; o retorno público ainda não permite provar estoque, capacidade, composição das taxas ou bloqueio. Os valores de Pix, cartão e sinal são preservados sem reaplicar nossas taxas.

Não há endpoint de disponibilidade confirmada, criação, confirmação, cancelamento ou pagamento. Autenticação CNSP aceita não comprova acesso funcional a essas operações.

## Evolução

1. Mapear as ações externas com exemplos válidos e autorização do fornecedor.
2. Implementar identificação completa, fotos, taxas e disponibilidade verificável.
3. Somente depois definir bloqueio, idempotência, consulta após timeout, confirmação e expiração.
4. Publicar futuramente como serviço separado, com autenticação, TLS, configuração e armazenamento próprios.
5. Conectar ao nosso catálogo sob uma flag nova, mantendo Stays e checkout atuais como estão.

Playwright é uma alternativa futura para consultas que realmente exijam navegador. Não foi necessário para o preço atual e não foi instalado nem usado nesta versão. Se adotado, deverá bloquear submissões de reserva/pagamento e executar em perfil isolado, sem sessões da operação.

## Fotos e evidência administrativa

`node scripts/collect-media.mjs` identifica URLs de fotos nas páginas das referências conhecidas, sem baixar todas as imagens. Separa galerias de apartamentos, áreas comuns e logos. O resultado fica em `data/media.json`, disponível em `GET /api/media`. `node scripts/stage-listings.mjs` associa apenas fotos da mesma identidade à exportação local, sem publicar imóveis.

A consulta administrativa observada usa POST `/Ajax.php`, Controller `hospedagem`, Action `getOrcamentoRede`, com sessão autenticada. Foi validada manualmente no Chrome; não está automatizada no servidor local e suas credenciais não foram exportadas. A evidência de mínimo de duas noites está em `data/admin-evidence.json`. O calendário mensal completo dos parceiros continua sem confirmação.

## Consulta administrativa automatizada (local)

### Sessão única do operador e do executor

O executor abre duas abas no **mesmo navegador e na mesma sessão em memória**: uma para a equipe usar o painel normalmente e outra, restrita a consultas, para o trabalho automático. Faça login na aba da equipe; a aba automática reconhece a mesma sessão. A aba da equipe não é redirecionada pelo executor. Ao fechar o navegador, a sessão é descartada. Abrir outra sessão independente da ImobSys pode invalidar esta sessão, conforme o comportamento do fornecedor.

### Imagem isolada para preparação do Coolify

O `Dockerfile` prepara somente o serviço Node, com usuário sem privilégios e verificação de saúde. Ele não contém credenciais nem o navegador. O processo escuta em `0.0.0.0` dentro do contêiner para permitir tráfego privado entre containers; a imagem não deve ser publicada como serviço HTTP aberto. Restrinja os cabeçalhos `Host` e `Origin` com `IMOBSYS_ALLOWED_HOSTS`. O diretório `/app/data` precisa de armazenamento persistente gravável pelo usuário `node` para preservar os pedidos e operações de teste.

Essa imagem, isoladamente, **não completa a instalação no Coolify**: o navegador autenticado precisa de um transporte seguro entre o executor e o serviço, e de um modo de login operacional no ambiente remoto. O protocolo atual usa um arquivo de controle local e loopback; não exponha o endpoint interno nem copie cookies para contornar isso. A integração permanece em sandbox e não está pronta para cobrar clientes ou substituir o checkout atual.

O transporte usa Playwright com contexto não persistente e uma sessão compartilhada entre a aba do operador e a aba automática. Não lê tokens/cookies do Chrome habitual, não grava storageState e não salva credenciais. Ao encerrar o navegador, a sessão se perde. Quando o fornecedor exigir novo login, o usuário precisa entrar novamente na aba do operador.

1. Inicie o serviço: node --env-file-if-exists=.env src/server.mjs.
2. Disponibilize o pacote playwright (ou configure IMOBSYS_PLAYWRIGHT_MODULE com o caminho local do módulo).
3. Inicie: node scripts/standalone-browser-worker.mjs.
4. Entre manualmente na aba do operador. O executor detecta o login na mesma sessão e conecta a fila local.
5. Use o botão Consulta autenticada da rede no painel local ou GET /api/admin/availability?from=2026-11-19&to=2026-11-21&unit=00109. guests é opcional (2 a 10); unit vazio consulta a rede.

O navegador permite somente login manual, páginas/recursos necessários e as ações observadas hospedagem/getOrcamentoRede e hospedagem/newSugestao_saida. Não há execução de Alugar, Gerar Link, criação de cliente, reserva ou cobrança. O arquivo local ignorado data/admin-control.json contém uma chave de controle local, nunca a sessão ImobSys. A API exige essa chave para distribuir trabalhos ao executor; o frontend não recebe a chave.

Os resultados distinguem offers-found, restricted e not-observed. Uma restrição mínima é explícita; ausência continua desconhecida. O preço normalizado é o Pix do hóspede, nunca o campo Pagar (repasse). O período nos links de cada oferta é comparado com o solicitado. Não há bloqueio nem garantia de reserva.

O bootstrap HTTP por contexto cifrado foi preparado, mas os campos protegidos pelo navegador não fornecem credenciais utilizáveis; valores mascarados são recusados. Esse transporte não foi conectado. O modo operacional é browser: connected em GET /api/admin/status. Não tentar contornar o mascaramento ou exportar perfil/cookies.

Validação independente (sem ferramenta de navegador da conversa): data/admin-standalone-validation.json contém quatro consultas HTTP200: uma oferta de R$994,00 da base1/ref1149 em 19–21/11/2026; mínimo de duas noites em 19–20/11; 116 ofertas das bases1/2/31 em 20–22/11; e D1003 para quatro hóspedes, base2/ref772, R$1.164,00. 32 testes automatizados passaram. O executor e o servidor precisam permanecer abertos. Ainda não foi validada operação contínua de longa duração, nem disponibilidade diária para todo o catálogo.

## Prévia local dos apartamentos

Abra http://127.0.0.1:8012/previa. A página usa identidade visual da Central, cartões de unidades, galeria, preço total no Pix por período e datas selecionáveis. Nenhum checkout está conectado. Busca ao vivo exige executor autenticado; períodos gravados são consultáveis sem login. Réveillon sem ofertas continua desconhecido, não ocupado. A apresentação é interna e não autoriza publicar automaticamente imóveis de fornecedores que não estão habilitados para o site.

node scripts/map-authenticated-availability.mjs consulta oito períodos sequencialmente e mantém resultados anteriores se houver falha. Os dados ficam em data/authenticated-availability.json. data/partner-catalog.json reúne referências observadas no painel, separadamente do catálogo público. O coletor de mídia considera a união desses dois conjuntos. O calendário diário completo não foi comprovado.

## Pacote preparado para integração futura

`node scripts/map-rolling-availability.mjs` consulta 14 datas de entrada futuras, em estadias de duas noites, com hóspedes sem filtro. Não é um calendário diário de ocupação. Cada falha permanece desconhecida e não apaga o resultado anterior.

`node scripts/prepare-integration.mjs` produz `data/integration-candidates.json`: identidade composta fornecedor/base/referência, `siteCandidate`, fotos de unidade e condomínio separadas, `datedQuotes` por datas/hóspedes e `queryObservations`. Não calcula diária a partir de total com taxas desconhecidas e não cria avaliações, anfitriões, localização ou dados de imóvel inexistentes. Todos ficam null quando desconhecidos. Os candidatos permanecem sem publicação e sem operações de reserva/pagamento.

O cliente publicado atualmente valida apenas stays-live/stays-simulated. A integração futura exige incluir explicitamente imobsys-live nos validadores, caches e roteamento por fornecedor. Não usar IDs Stays para esses candidatos. O plano por etapas está em data/integration-plan.json. A situação resumida pode ser consultada em GET /api/integration/status.

Branding conferido diretamente no DOM/CSS do site publicado: Plus Jakarta Sans, marca SVG oficial, gradiente laranja #f97316/#ea580c, símbolo #18181b, fundo radial e cartões com raio16px, proporção4:3 e sombra correspondente. Fonte e SVG copiados para o serviço separado; nenhum arquivo do site atual foi editado. Evidência: data/branding-source.json; aplicação em public/brand-current.css.
