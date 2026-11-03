<?php

namespace App\Http\Controllers;

use App\Services\LegalPageRegistry;
use App\Services\PropertyMetadataResolver;
use App\Services\PublicPageRegistry;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class SpaController extends Controller
{
    private const PROPERTY_PATH_PATTERN = '~^(?:(?:[a-z]{2}/)?(?:apartamento|apartment))/[a-zA-Z0-9_-]+(?:/.*)?$~i';

    private const NON_INDEXABLE_PATH_PATTERN = '~^(?:(?:checkout|reservar)/[a-zA-Z0-9_-]+(?:/.*)?|(?:[a-z]{2}/)?(?:apartamento|apartment)/[a-zA-Z0-9_-]+(?:/.*)?)$~i';

    public function __construct(
        private PropertyMetadataResolver $metadataResolver,
        private LegalPageRegistry $legalPages,
        private PublicPageRegistry $publicPages,
        private StaysDiscoveryCatalog $discoveryCatalog,
    ) {}

    public function __invoke(?string $path = null): Response
    {
        $legalSlug = $this->legalSlugFromPath($path);
        $legalPage = $legalSlug === null ? null : $this->legalPages->find($legalSlug);
        if ($legalSlug !== null && $legalPage === null) {
            return response('Página indisponível.', 404)
                ->header('X-Robots-Tag', 'noindex, nofollow');
        }

        $indexPath = public_path('index.html');
        if (! is_file($indexPath)) {
            return response('Aplicação indisponível.', 503)->header('X-Robots-Tag', 'noindex, nofollow');
        }

        $html = file_get_contents($indexPath);
        if ($html === false) {
            return response('Aplicação indisponível.', 503)->header('X-Robots-Tag', 'noindex, nofollow');
        }

        $html = Str::replaceFirst('</head>', '<meta name="public-site-origin" content="'.e($this->publicPages->origin()).'" />'."\n</head>", $html);

        if ($legalPage !== null) {
            return $this->legalPageResponse($legalPage, $html);
        }

        $propertyId = $this->propertyIdFromPath($path);
        if ($propertyId !== null) {
            $metadata = $this->metadataResolver->resolve($propertyId);
            $listing = $this->discoveryCatalog->listing($propertyId);
            if ($metadata !== null && $listing !== null && $listing['id'] === $propertyId && str_starts_with((string) $path, 'apartamento/')) {
                $canonicalPath = $this->discoveryCatalog->listingPath($listing);
                if ('/'.trim((string) $path, '/') !== $canonicalPath) {
                    $query = request()->server('QUERY_STRING', '');
                    abort_if(! is_string($query) || preg_match('/[\r\n]/', $query) === 1, 400);

                    return redirect($metadata['canonicalUrl'].($query !== '' ? '?'.$query : ''), 301);
                }
            }

            return $this->propertyResponse($propertyId, $html);
        }

        if ($this->isNonIndexablePath($path)) {
            return $this->noindexResponse($html);
        }

        if (trim((string) $path, '/') === '') {
            return $this->homeResponse($html);
        }

        if (preg_match('~^(?:[a-z]{2}(?:/search)?|search|auth/confirm|checkout-preview/cielo)$~D', trim((string) $path, '/')) === 1) {
            return $this->noindexResponse($html);
        }

        return response('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Página não encontrada | CRCN</title></head><body><main><h1>Página não encontrada</h1><a href="/">Voltar à busca de hospedagens</a></main></body></html>', 404)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    private function homeResponse(string $html): Response
    {
        $origin = $this->publicPages->origin();
        $canonical = e($origin.'/');
        $graph = $this->publicPages->schemaJson('/', 'Hospedagens em Caldas Novas e região');
        $head = '<link rel="canonical" href="'.$canonical.'" />'."\n".
            '<meta property="og:url" content="'.$canonical.'" />'."\n".
            '<meta property="og:locale" content="pt_BR" />'."\n".
            '<link rel="stylesheet" href="/seo.css" />'."\n".
            '<link rel="stylesheet" href="/home-loading-20261103.css" />'."\n".
            '<script id="public-page-schema" type="application/ld+json">'.$graph.'</script>';
        $html = Str::replaceFirst('</head>', $head."\n</head>", $html);
        $content = view('seo.introduction', ['pages' => $this->publicPages->all()])->render();
        $loadingShell = view('seo.home-loading-shell')->render();
        $rootContent = '<div id="root">'.$loadingShell.'</div><noscript>'.$content.'</noscript>';
        $html = Str::replaceFirst('<div id="root"></div>', $rootContent, $html);

        return response($html)->header('Content-Type', 'text/html; charset=utf-8');
    }

    /**
     * @param  array{slug: string, path: string, title: string, version: string, publishedAt: string, sections: list<array{title: string, content: string}>}  $page
     */
    private function legalPageResponse(array $page, string $html): Response
    {
        $title = e($page['title']);
        $canonicalUrl = e(rtrim((string) config('app.url'), '/').$page['path']);
        $metadata = <<<HTML
<title>{$title} | CRCN</title>
<meta name="description" content="{$title}" />
<link rel="canonical" href="{$canonicalUrl}" />
HTML;
        $html = $this->removeGenericMetadata($html);
        $html = Str::replaceFirst('</head>', $metadata."\n</head>", $html);

        return response($html)->header('Content-Type', 'text/html; charset=utf-8');
    }

    private function legalSlugFromPath(?string $path): ?string
    {
        return match (rtrim((string) $path, '/')) {
            'privacidade' => 'privacidade',
            'termos' => 'termos',
            'cancelamento' => 'cancelamento',
            default => null,
        };
    }

    private function propertyResponse(string $propertyId, string $html): Response
    {
        $metadata = $this->metadataResolver->resolve($propertyId);
        if ($metadata === null) {
            return $this->noindexResponse($html);
        }

        $content = $this->discoveryCatalog->listing($propertyId);
        $snapshot = $this->discoveryCatalog->snapshot();
        $condominium = $snapshot['properties'][$content['propertyId'] ?? ''] ?? null;
        $condominiumPath = $condominium && $condominium['listingIds'] !== [] ? $this->discoveryCatalog->propertyPath($condominium) : null;
        $summary = view('seo.property-summary', [
            'metadata' => $metadata, 'content' => $content, 'condominium' => $condominium,
            'condominiumPath' => $condominiumPath,
        ])->render();
        $html = Str::replaceFirst('<div id="root"></div>', '<div id="root">'.$summary.'</div>', $html);
        $entities = [];
        if ($content !== null) {
            $entity = [
                '@type' => 'Accommodation', '@id' => $metadata['canonicalUrl'].'#accommodation',
                'name' => $content['name'], 'description' => $content['description'],
                'url' => $metadata['canonicalUrl'], 'image' => $content['images'],
                'address' => ['@type' => 'PostalAddress', 'addressLocality' => $content['city'], 'addressRegion' => $content['state']],
                'amenityFeature' => array_map(fn (string $name): array => ['@type' => 'LocationFeatureSpecification', 'name' => $name, 'value' => true], $content['amenities']),
            ];
            if ($content['maxGuests'] !== null) {
                $entity['occupancy'] = ['@type' => 'QuantitativeValue', 'maxValue' => $content['maxGuests']];
            }
            if ($condominiumPath !== null) {
                $entity['containedInPlace'] = ['@type' => 'Place', 'name' => $condominium['name'], 'url' => $this->publicPages->origin().$condominiumPath];
            }
            $entities[] = $entity;
        }
        $schema = $this->publicPages->schemaJson(parse_url($metadata['canonicalUrl'], PHP_URL_PATH) ?: '/apartamento/'.$propertyId, $metadata['title'], $entities);
        $html = Str::replaceFirst('</head>', '<link rel="stylesheet" href="/seo.css" />'."\n".'<script id="public-property-schema" data-property-id="'.e($propertyId).'" type="application/ld+json">'.$schema.'</script>'."\n</head>", $html);

        $title = e($metadata['title']);
        $description = e($metadata['description']);
        $canonical = e($metadata['canonicalUrl']);
        $imageUrl = $metadata['imageUrl'];
        $twitterCard = $imageUrl === null ? 'summary' : 'summary_large_image';
        $imageMetadata = $imageUrl === null
            ? ''
            : '<meta property="og:image" content="'.e($imageUrl).'" />'."\n".'<meta name="twitter:image" content="'.e($imageUrl).'" />'."\n";
        $metadata = <<<HTML
<title>{$title}</title>
<meta name="description" content="{$description}" />
<link rel="canonical" href="{$canonical}" />
<meta property="og:title" content="{$title}" />
<meta property="og:description" content="{$description}" />
<meta property="og:url" content="{$canonical}" />
<meta property="og:type" content="website" />
{$imageMetadata}<meta name="twitter:card" content="{$twitterCard}" />
<meta name="twitter:title" content="{$title}" />
<meta name="twitter:description" content="{$description}" />
HTML;

        $html = $this->removeGenericMetadata($html);
        $html = Str::replaceFirst('</head>', $metadata."\n</head>", $html);

        return response($html)->header('Content-Type', 'text/html; charset=utf-8');
    }

    private function noindexResponse(string $html): Response
    {
        $html = preg_replace('~<meta\b(?=[^>]*\bname\s*=\s*(["\'])robots\1)[^>]*>\s*~i', '', $html) ?? $html;
        $html = Str::replaceFirst('</head>', '<meta name="robots" content="noindex, nofollow" /></head>', $html);

        return response($html)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    private function removeGenericMetadata(string $html): string
    {
        $html = preg_replace('~<title\b[^>]*>.*?</title\s*>\s*~is', '', $html) ?? $html;
        $html = preg_replace_callback('~<meta\b[^>]*>\s*~i', function (array $matches): string {
            $tag = $matches[0];
            if (preg_match('~\b(?:name|property)\s*=\s*(["\'])([^"\']+)\1~i', $tag, $attribute) !== 1) {
                return $tag;
            }

            return in_array(mb_strtolower($attribute[2]), [
                'description',
                'og:title',
                'og:description',
                'og:url',
                'og:type',
                'og:image',
                'twitter:image',
                'twitter:card',
                'twitter:title',
                'twitter:description',
            ], true) ? '' : $tag;
        }, $html) ?? $html;
        $html = preg_replace_callback('~<link\b[^>]*>\s*~i', function (array $matches): string {
            return preg_match('~\brel\s*=\s*(["\'])canonical\1~i', $matches[0]) === 1 ? '' : $matches[0];
        }, $html) ?? $html;

        return $html;
    }

    private function propertyIdFromPath(?string $path): ?string
    {
        if (! is_string($path) || preg_match(self::PROPERTY_PATH_PATTERN, $path) !== 1) {
            return null;
        }

        return preg_match('~^(?:[a-z]{2}/)?(?:apartamento|apartment)/([a-zA-Z0-9_-]+)(?:/.*)?$~i', $path, $matches) === 1
            ? $matches[1]
            : null;
    }

    private function isNonIndexablePath(?string $path): bool
    {
        return is_string($path) && preg_match(self::NON_INDEXABLE_PATH_PATTERN, $path) === 1;
    }
}
