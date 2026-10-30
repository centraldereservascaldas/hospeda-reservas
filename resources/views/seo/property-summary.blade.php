<main class="public-content" aria-label="Resumo da acomodação">
    <nav aria-label="Caminho da página"><a href="/">Hospedagens</a></nav>
    <h1>{{ $metadata['title'] }}</h1>
    <p>{{ $metadata['description'] }}</p>
    @if ($content ?? null)
        <p>{{ $content['city'] }}@if ($content['neighborhood']) · {{ $content['neighborhood'] }}@endif</p>
        @if ($content['images'])<img class="discovery-cover" src="{{ $content['images'][0] }}" alt="{{ $content['name'] }}" width="1200" height="750" fetchpriority="high">@endif
        <h2>Sobre a acomodação</h2>
        <p class="discovery-description">{{ $content['description'] }}</p>
        @include('seo.accommodation-facts', ['listing' => $content])
        @if ($content['amenities'])<h2>Comodidades da unidade</h2><ul>@foreach ($content['amenities'] as $amenity)<li>{{ $amenity }}</li>@endforeach</ul>@endif
        @if ($condominiumPath)<p>Conheça o empreendimento <a href="{{ $condominiumPath }}">{{ $condominium['name'] }}</a> e suas outras acomodações.</p>@endif
    @endif
    <p>Selecione datas e hóspedes para consultar disponibilidade e condições da estadia.</p>
    <a href="/blog/">Veja os guias para planejar sua viagem</a>
</main>
