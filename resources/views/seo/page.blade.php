<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $page['title'] }}</title>
    <meta name="description" content="{{ $page['description'] }}">
    <link rel="canonical" href="{{ $origin.$path }}">
    <meta property="og:title" content="{{ $page['title'] }}">
    <meta property="og:description" content="{{ $page['description'] }}">
    <meta property="og:url" content="{{ $origin.$path }}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary">
    <link rel="preload" href="/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/seo.css">
    <script type="application/ld+json">{!! $schema !!}</script>
</head>
<body class="public-page">
    <a class="public-skip" href="#conteudo">Ir para o conteúdo</a>
    <header class="guide-header">
        <div class="guide-shell guide-header-inner">
            <a class="guide-brand" href="/" aria-label="Central de Reservas Caldas Novas — início">
                @include('seo.brand')
                <span><strong>CENTRAL</strong><small>DE RESERVAS</small><b>CALDAS NOVAS</b></span>
            </a>
            <nav aria-label="Navegação principal"><a href="/blog/">Blog e guias</a><a class="guide-header-action" href="/">Encontrar hospedagem <span aria-hidden="true">↗</span></a></nav>
        </div>
    </header>
    <main tabindex="-1" id="conteudo">
        <section class="guide-hero">
            <div class="guide-shell">
                <nav class="guide-breadcrumb" aria-label="Caminho da página"><a href="/">Início</a><span aria-hidden="true">/</span><span>{{ isset($page['destination']) ? 'Destinos' : 'Guia de hospedagem' }}</span></nav>
                <div class="guide-hero-grid">
                    <div>
                        <p class="guide-eyebrow"><span aria-hidden="true"></span> CALDAS NOVAS E REGIÃO</p>
                        <h1>{{ $page['heading'] }}</h1>
                        <p class="guide-lead">{{ $page['description'] }}</p>
                        <a class="guide-text-link" href="#passo-1">Veja o que levar em conta <span aria-hidden="true">↓</span></a>
                    </div>
                    <div class="guide-art" aria-hidden="true">
                        <svg class="guide-landscape" viewBox="0 0 420 340" fill="none"><circle cx="300" cy="95" r="55" fill="#FBBF78"/><path d="M0 220Q90 135 185 200T420 175V340H0Z" fill="#F4D2AD"/><path d="M0 260Q110 190 210 245T420 220V340H0Z" fill="#D4E3D5"/><path d="M0 300Q120 240 225 290T420 270V340H0Z" fill="#A9C9C1"/><path d="M55 305Q165 265 260 310M210 267Q280 248 365 270" stroke="#FFF" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/></svg>
                        <div class="guide-plan-card"><span class="guide-plan-icon">⌖</span><small>UM BOM COMEÇO</small><strong>O lugar certo<br>para a sua viagem.</strong><div><span>Localização</span><span>Conforto</span><span>Planejamento</span></div></div>
                        <span class="guide-art-caption">Escolha com calma. Viaje com mais clareza.</span>
                    </div>
                </div>
            </div>
        </section>
        <div class="guide-shell guide-body">
            <aside class="guide-index">
                <nav aria-label="Neste guia"><p class="guide-eyebrow">NESTE GUIA</p><ol>
                    @foreach ($page['sections'] as $section)
                        <li><a href="#passo-{{ $loop->iteration }}"><span>{{ str_pad((string) $loop->iteration, 2, '0', STR_PAD_LEFT) }}</span>{{ $section['title'] }}</a></li>
                    @endforeach
                </ol></nav>
                <p class="guide-index-note">Cada hospedagem tem suas particularidades. Confira sempre as condições do anúncio escolhido.</p>
            </aside>
            <article class="guide-article" aria-label="Orientações para sua viagem">
                @foreach ($page['sections'] as $section)
                    <section id="passo-{{ $loop->iteration }}" class="guide-section"><span class="guide-step" aria-hidden="true">{{ str_pad((string) $loop->iteration, 2, '0', STR_PAD_LEFT) }}</span><div><h2>{{ $section['title'] }}</h2><p>{{ $section['content'] }}</p></div></section>
                @endforeach
                <div class="guide-note"><span aria-hidden="true">↗</span><p><strong>Uma escolha informada faz diferença.</strong> Use este guia para comparar opções. Disponibilidade, valores e condições devem ser confirmados para as datas da sua viagem.</p></div>
            </article>
        </div>
        <section class="guide-shell guide-cta-wrap" aria-labelledby="guide-search-title"><div class="guide-cta"><div><p class="guide-eyebrow">O PRÓXIMO PASSO É SEU</p><h2 id="guide-search-title">Encontre um lugar para os seus dias de descanso.</h2><p>Informe suas datas e hóspedes e conheça as opções para a sua viagem.</p></div><a class="public-action" href="/{{ isset($page['destination']) ? '?'.http_build_query(['destination' => $page['destination']]) : '' }}#stays-apartments-catalog">Consultar hospedagens e disponibilidade <span aria-hidden="true">↗</span></a></div></section>
        <div class="public-content">@include('seo.links', ['pages' => $pages])</div>
    </main>
    <footer class="guide-footer"><div class="guide-shell"><a class="guide-footer-brand" href="/">Central de Reservas Caldas Novas</a><a href="mailto:centraldereservascn@gmail.com">Fale com a CRCN <span aria-hidden="true">↗</span></a><p>CENTRAL DE RESERVAS CALDAS NOVAS CRCN LTDA · CNPJ 67.314.679/0001-64</p></div></footer>
</body>
</html>
