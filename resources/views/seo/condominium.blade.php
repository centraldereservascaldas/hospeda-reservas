@extends('seo.discovery-layout')
@section('discovery-content')
<section class="guide-hero"><div class="guide-shell">
    <nav class="guide-breadcrumb" aria-label="Caminho da página"><a href="/">Início</a><span>/</span><a href="{{ route('condominiums.index', absolute: false) }}">Empreendimentos</a><span>/</span><span>{{ $property['name'] }}</span></nav>
    <div class="discovery-hero-grid"><div><p class="guide-eyebrow">{{ $property['city'] }} @if($property['state']) · {{ $property['state'] }}@endif</p>
        <h1>{{ $property['name'] }}</h1>
        @if ($property['neighborhood'])<p class="guide-lead">{{ $property['neighborhood'] }}</p>@endif
        <p>{{ count($listings) }} {{ count($listings) === 1 ? 'acomodação no nosso catálogo' : 'acomodações no nosso catálogo' }} neste empreendimento.</p>
        <a class="public-action" href="#acomodacoes">Conhecer as acomodações ↓</a>
    </div>
    @if ($property['images'])<img class="discovery-cover" src="{{ $property['images'][0] }}" alt="{{ $property['name'] }} — foto do empreendimento" width="1200" height="750" fetchpriority="high">@endif
    </div>
</div></section>
<div class="guide-shell discovery-section discovery-detail-grid">
    <article><h2>Sobre {{ $property['name'] }}</h2>
        @if ($property['description'])<p class="discovery-description">{{ $property['description'] }}</p>@else<p>A descrição está sendo atualizada.</p>@endif
        @if ($property['amenities'])<h2>Estrutura do empreendimento</h2><ul class="discovery-amenities">@foreach ($property['amenities'] as $amenity)<li>{{ $amenity }}</li>@endforeach</ul>@endif
        @if (count($property['images']) > 1)<h2>Conheça os espaços</h2><div class="discovery-photos">@foreach (array_slice($property['images'], 1) as $image)<img src="{{ $image }}" alt="{{ $property['name'] }} — foto {{ $loop->iteration + 1 }} do empreendimento" width="720" height="450" loading="lazy" decoding="async">@endforeach</div>@endif
    </article>
    <aside class="discovery-booking"><p class="guide-eyebrow">UMA ESTADIA DO SEU JEITO</p><h2>Escolha a unidade. Confira suas datas.</h2><p>As acomodações podem ter equipamentos, regras e condições diferentes, mesmo dentro do mesmo empreendimento.</p><a class="public-action" href="{{ $searchUrl }}">Consultar datas e hóspedes ↗</a><p>Disponibilidade, serviços incluídos e valor total devem ser confirmados na busca e no anúncio escolhido.</p></aside>
</div>
<section class="guide-shell discovery-section" id="acomodacoes" aria-labelledby="accommodation-heading">
    <p class="guide-eyebrow">ENCONTRE O SEU LUGAR</p><h2 id="accommodation-heading">Acomodações em {{ $property['name'] }}</h2><p>Compare a capacidade e a configuração de cada unidade. A presença no catálogo não confirma disponibilidade para uma data específica.</p>
    <div class="discovery-grid">
        @foreach ($listings as $listing)
        <article class="discovery-card">
            @if ($listing['images'])<a href="{{ $catalog->listingPath($listing) }}"><img src="{{ $listing['images'][0] }}" alt="{{ $listing['name'] }} — acomodação" width="720" height="450" loading="lazy" decoding="async"></a>@endif
            <div><h3><a href="{{ $catalog->listingPath($listing) }}">{{ $listing['name'] }}</a></h3>@include('seo.accommodation-facts')<a class="guide-text-link" href="{{ $catalog->listingPath($listing) }}">Conhecer esta acomodação ↗</a></div>
        </article>
        @endforeach
    </div>
</section>
<section class="guide-shell discovery-section"><div class="guide-note"><p>Quer organizar a viagem? Leia <a href="/blog/onde-ficar-em-caldas-novas/">como escolher onde ficar em Caldas Novas</a> e o <a href="/blog/checklist-reservar-apartamento-caldas-novas/">checklist antes de reservar</a>.</p></div></section>
@endsection
