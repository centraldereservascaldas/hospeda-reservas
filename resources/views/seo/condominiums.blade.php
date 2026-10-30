@extends('seo.discovery-layout')
@section('discovery-content')
<section class="guide-hero"><div class="guide-shell">
    <nav class="guide-breadcrumb" aria-label="Caminho da página"><a href="/">Início</a><span>/</span><span>Empreendimentos</span></nav>
    <p class="guide-eyebrow">ESCOLHA ONDE VIVER OS SEUS DIAS DE DESCANSO</p>
    <h1>Conheça os condomínios e empreendimentos.</h1>
    <p class="guide-lead">Compare localização e estrutura. Depois, encontre a acomodação que combina com a sua viagem.</p>
</div></section>
<section class="guide-shell discovery-section" aria-label="Empreendimentos e suas acomodações">
    <div class="discovery-grid">
    @forelse ($properties as $item)
        <article class="discovery-card">
            <a href="{{ $catalog->propertyPath($item) }}">
                @if ($item['images'])<img src="{{ $item['images'][0] }}" alt="{{ $item['name'] }} — empreendimento" width="720" height="450" loading="{{ $loop->index < 3 ? 'eager' : 'lazy' }}" decoding="async">@endif
                <div><p class="guide-eyebrow">{{ $item['city'] }}</p><h2>{{ $item['name'] }}</h2><p>{{ \Illuminate\Support\Str::limit(preg_replace('/\s+/u', ' ', $item['description']), 170) }}</p><strong>{{ count($item['listingIds']) }} {{ count($item['listingIds']) === 1 ? 'acomodação no catálogo' : 'acomodações no catálogo' }} ↗</strong></div>
            </a>
        </article>
    @empty
        <p>Estamos atualizando as opções. <a href="/">Consulte a busca de hospedagens.</a></p>
    @endforelse
    </div>
</section>
@endsection
