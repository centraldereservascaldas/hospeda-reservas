<?php

namespace App\Http\Controllers;

use App\Services\LegalPageRegistry;
use App\Services\PropertyMetadataResolver;
use App\Services\PublicPageRegistry;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Http\Response;

class SearchDiscoveryController extends Controller
{
    public function __construct(private PublicPageRegistry $pages) {}

    public function robots(): Response
    {
        return response("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /external/\n\nSitemap: ".$this->pages->origin()."/sitemap.xml\n")
            ->header('Content-Type', 'text/plain; charset=utf-8');
    }

    public function sitemap(PropertyMetadataResolver $properties, LegalPageRegistry $legal, StaysDiscoveryCatalog $catalog): Response
    {
        $urls = [$this->pages->origin().'/'];
        foreach (array_keys($this->pages->all()) as $path) {
            $urls[] = $this->pages->origin().'/'.$path;
        }
        foreach ($legal->all() as $page) {
            $urls[] = $this->pages->origin().$page['path'];
        }
        $snapshot = $catalog->snapshot();
        foreach ($snapshot['properties'] ?? [] as $property) {
            if ($property['indexable']) {
                $urls[] = $this->pages->origin().$catalog->propertyPath($property);
            }
        }
        if (array_filter($snapshot['properties'] ?? [], fn (array $property): bool => $property['listingIds'] !== [])) {
            $urls[] = $this->pages->origin().'/condominios';
        }
        foreach (array_unique([...array_keys(config('property_metadata.listings', [])), ...array_keys($snapshot['listings'] ?? [])]) as $id) {
            if (preg_match('/^[a-zA-Z0-9_-]+$/D', (string) $id) !== 1) {
                continue;
            }
            $metadata = $properties->resolve((string) $id);
            if ($metadata !== null) {
                $urls[] = $metadata['canonicalUrl'];
            }
        }

        $manifestPath = public_path('blog/routes.json');
        $blogPaths = is_file($manifestPath) ? json_decode(file_get_contents($manifestPath) ?: '', true) : [];
        if (is_array($blogPaths)) {
            foreach ($blogPaths as $path) {
                if (is_string($path) && preg_match('~^/blog/(?:[a-z0-9-]+/)*$~D', $path) === 1) {
                    $urls[] = $this->pages->origin().$path;
                }
            }
        }

        return response()->view('seo.sitemap', ['urls' => array_values(array_unique($urls))])
            ->header('Content-Type', 'application/xml; charset=utf-8');
    }

    public function show(string $section, string $slug): Response
    {
        $path = '/'.$section.'/'.$slug;
        $page = $this->pages->find($path);
        abort_if($page === null, 404);

        return response()->view('seo.page', [
            'page' => $page, 'path' => $path, 'origin' => $this->pages->origin(),
            'pages' => $this->pages->all(), 'schema' => $this->pages->schemaJson($path, $page['heading']),
        ]);
    }
}
