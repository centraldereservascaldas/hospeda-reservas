<?php

namespace App\Http\Controllers;

use App\Services\LegalPageRegistry;
use App\Services\PropertyMetadataResolver;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class SpaController extends Controller
{
    private const PROPERTY_PATH_PATTERN = '~^(?:(?:[a-z]{2}/)?(?:apartamento|apartment))/[a-zA-Z0-9_-]+(?:/.*)?$~i';

    private const NON_INDEXABLE_PATH_PATTERN = '~^(?:(?:checkout|reservar)/[a-zA-Z0-9_-]+(?:/.*)?|(?:[a-z]{2}/)?(?:apartamento|apartment)/[a-zA-Z0-9_-]+(?:/.*)?)$~i';

    public function __construct(
        private PropertyMetadataResolver $metadataResolver,
        private LegalPageRegistry $legalPages,
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

        if ($legalPage !== null) {
            return $this->legalPageResponse($legalPage, $html);
        }

        $propertyId = $this->propertyIdFromPath($path);
        if ($propertyId !== null) {
            return $this->propertyResponse($propertyId, $html);
        }

        if ($this->isNonIndexablePath($path)) {
            return $this->noindexResponse($html);
        }

        return response()->file($indexPath);
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
