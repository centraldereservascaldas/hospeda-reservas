<dl class="discovery-facts">
    @if ($listing['maxGuests'] !== null)<div><dt>Capacidade</dt><dd>Até {{ $listing['maxGuests'] }} hóspedes</dd></div>@endif
    @if ($listing['bedrooms'] !== null)<div><dt>Quartos</dt><dd>{{ $listing['bedrooms'] }}</dd></div>@endif
    @if ($listing['beds'] !== null)<div><dt>Camas</dt><dd>{{ $listing['beds'] }}</dd></div>@endif
    @if ($listing['bathrooms'] !== null)<div><dt>Banheiros</dt><dd>{{ $listing['bathrooms'] }}</dd></div>@endif
</dl>
