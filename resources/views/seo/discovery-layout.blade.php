<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <meta name="description" content="{{ $description }}">
    <meta name="robots" content="{{ $indexable ? 'index, follow' : 'noindex, follow' }}">
    <link rel="canonical" href="{{ $canonical }}">
    <meta property="og:title" content="{{ $title }}">
    <meta property="og:description" content="{{ $description }}">
    <meta property="og:url" content="{{ $canonical }}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    @if (!empty($property['images'][0]))<meta property="og:image" content="{{ $property['images'][0] }}">@endif
    <meta name="twitter:card" content="summary">
    <link rel="preload" href="/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/brand-theme.css">
    <link rel="stylesheet" href="/seo.css">
    <link rel="stylesheet" href="/discovery.css">
    <script type="application/ld+json">{!! $schema !!}</script>
</head>
<body class="public-page discovery-page">
    <a class="public-skip" href="#conteudo">Ir para o conteúdo</a>
    <header class="guide-header"><div class="guide-shell guide-header-inner">
        <a class="guide-brand" href="/" aria-label="Central de Reservas Caldas Novas — início">@include('seo.brand')<span><strong>CENTRAL</strong><small>DE RESERVAS</small><b>CALDAS NOVAS</b></span></a>
        <nav aria-label="Navegação principal"><a href="/blog/">Blog e guias</a><a class="guide-header-action" href="/#stays-apartments-catalog">Ver hospedagens ↗</a></nav>
    </div></header>
    <main id="conteudo" tabindex="-1">@yield('discovery-content')</main>
    <footer class="guide-footer"><div class="guide-shell"><a href="/condominios">Condomínios e empreendimentos</a><a href="/blog/">Planeje sua viagem</a><p>Central de Reservas Caldas Novas · CRCN</p></div></footer>
</body>
</html>
