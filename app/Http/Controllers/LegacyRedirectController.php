<?php

namespace App\Http\Controllers;

use App\Services\PublicPageRegistry;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Http\RedirectResponse;

class LegacyRedirectController extends Controller
{
    public function __invoke(string $legacySlug, StaysDiscoveryCatalog $catalog, PublicPageRegistry $pages): RedirectResponse
    {
        $snapshot = $catalog->snapshot();
        abort_if($snapshot === null, 503, 'Estamos atualizando os empreendimentos. Tente novamente em instantes.');
        $property = $snapshot['properties'][config('legacy_redirects.condominiums.'.$legacySlug)] ?? null;
        abort_if($property === null || $property['listingIds'] === [], 404);

        return redirect($pages->origin().$catalog->propertyPath($property), 301);
    }
}
