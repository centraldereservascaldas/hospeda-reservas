<?php

namespace App\Http\Controllers;

use App\Services\PublicPageRegistry;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class CondominiumPageController extends Controller
{
    public function __construct(private StaysDiscoveryCatalog $catalog, private PublicPageRegistry $pages) {}

    public function index(): Response
    {
        $snapshot = $this->catalog->snapshot();
        abort_if($snapshot === null, 503, 'Estamos atualizando os empreendimentos. Tente novamente em instantes.');
        $properties = array_values(array_filter($snapshot['properties'], fn (array $property): bool => $property['listingIds'] !== []));
        usort($properties, fn (array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));

        return $this->render('seo.condominiums', 'Condomínios e empreendimentos em Caldas Novas e região | CRCN', 'Conheça os empreendimentos, compare estrutura e localização e veja as acomodações de cada um para planejar sua estadia.', '/condominios', $properties !== [], [
            'properties' => $properties, 'catalog' => $this->catalog,
        ]);
    }

    public function show(string $id, ?string $slug = null): Response|RedirectResponse
    {
        $snapshot = $this->catalog->snapshot();
        abort_if($snapshot === null, 503, 'Estamos atualizando os empreendimentos. Tente novamente em instantes.');
        $property = $snapshot['properties'][$id] ?? null;
        if ($property === null) {
            foreach ($snapshot['properties'] as $candidate) {
                if ($this->catalog->propertyPath($candidate) === '/condominios/'.$id || in_array($id, $candidate['aliases'] ?? [], true)) {
                    $property = $candidate;
                    break;
                }
            }
        }
        if ($property === null) {
            $matches = array_values(array_filter($snapshot['properties'], fn (array $candidate): bool => ($candidate['shortId'] ?? '') !== '' && strcasecmp($candidate['shortId'], $id) === 0));
            $property = count($matches) === 1 ? $matches[0] : null;
            foreach ($snapshot['properties'] as $candidate) {
                if ($property !== null && $candidate['id'] !== $property['id'] && strcasecmp($candidate['canonicalSlug'] ?? $candidate['slug'], $id) === 0) {
                    $property = null;
                    break;
                }
            }
        }
        abort_if($property === null || $property['listingIds'] === [], 404);
        $path = $this->catalog->propertyPath($property);
        if ($slug !== null || '/condominios/'.$id !== $path) {
            return redirect($this->pages->origin().$path, 301);
        }
        $listings = array_values(array_intersect_key($snapshot['listings'], array_flip($property['listingIds'])));

        return $this->render('seo.condominium', $property['name'].' em '.$property['city'].' | Acomodações CRCN', Str::limit(preg_replace('/\s+/u', ' ', $property['description']) ?? '', 160), $path, $property['indexable'], [
            'property' => $property, 'listings' => $listings,
            'catalog' => $this->catalog,
            'searchUrl' => '/?'.http_build_query(['propertyId' => $property['id'], 'destination' => $property['name']]).'#stays-apartments-catalog',
        ]);
    }

    /** @param array<string, mixed> $data */
    private function render(string $view, string $title, string $description, string $path, bool $indexable, array $data): Response
    {
        $graph = ['@context' => 'https://schema.org', '@graph' => $this->pages->structuredData($path, $title)];
        if (isset($data['property'])) {
            $property = $data['property'];
            $graph['@graph'][] = [
                '@type' => 'Place', '@id' => $this->pages->origin().$path.'#empreendimento',
                'name' => $property['name'], 'description' => $property['description'],
                'url' => $this->pages->origin().$path, 'image' => $property['images'],
                'address' => ['@type' => 'PostalAddress', 'addressLocality' => $property['city'], 'addressRegion' => $property['state']],
            ];
        }
        $response = response()->view($view, [...$data, 'title' => $title, 'description' => $description,
            'canonical' => $this->pages->origin().$path, 'indexable' => $indexable,
            'schema' => json_encode($graph, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR),
        ])->header('Content-Type', 'text/html; charset=utf-8');
        if (! $indexable) {
            $response->header('X-Robots-Tag', 'noindex, follow');
        }

        return $response;
    }
}
