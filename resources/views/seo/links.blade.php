<nav class="guide-related" aria-label="Guias e destinos">
    <p class="guide-eyebrow">CONTINUE PLANEJANDO</p>
    <h2>Outras ideias para a sua viagem</h2>
    <ul>
        @foreach ($pages as $pagePath => $publicPage)
            @if ('/'.$pagePath !== ($path ?? null))
                <li><a href="/{{ $pagePath }}"><small>{{ isset($publicPage['destination']) ? 'DESTINO' : 'GUIA PRÁTICO' }}</small><strong>{{ $publicPage['heading'] }}</strong><span aria-hidden="true">↗</span></a></li>
            @endif
        @endforeach
        <li><a href="/condominios"><small>EMPREENDIMENTOS</small><strong>Conheça os condomínios e suas acomodações</strong><span aria-hidden="true">↗</span></a></li>
        <li><a href="/blog/"><small>BLOG CRCN</small><strong>Mais ideias para planejar a sua estadia</strong><span aria-hidden="true">↗</span></a></li>
    </ul>
</nav>
