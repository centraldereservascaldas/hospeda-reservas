<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#f8fafc">
    <title>{{ $status }} · Central de Reservas Caldas Novas</title>
    <link rel="preload" href="/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/brand-theme.css">
    <link rel="stylesheet" href="/error-page.css">
</head>
<body>
    <main class="error-shell" aria-labelledby="error-title">
        <header class="error-header">
            <a class="error-brand" href="/" aria-label="Central de Reservas Caldas Novas, início">
                <img src="/brand-crcn.svg" alt="">
                <span><strong>CENTRAL</strong><small>DE RESERVAS</small><b>CALDAS NOVAS</b></span>
            </a>
        </header>
        <section class="error-card" role="alert">
            <div class="error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.5 17.4A1.8 1.8 0 0 0 4 20h16a1.8 1.8 0 0 0 1.5-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></svg>
            </div>
            <p class="error-eyebrow">{{ $eyebrow }}</p>
            <h1 id="error-title">{{ $heading }}</h1>
            <p class="error-message">{{ $message }}</p>
            <div class="error-actions">
                <a class="error-button error-button-primary" href="{{ request()->getPathInfo() }}">Tentar novamente</a>
                <a class="error-button" href="/">Voltar para a página inicial</a>
            </div>
            <p class="error-code">Código de referência: {{ $status }}</p>
        </section>
    </main>
</body>
</html>
