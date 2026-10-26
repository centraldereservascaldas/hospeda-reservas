<?php

namespace App\Services;

class PropertyMetadataResolver
{
    /**
     * @return array{title: string, description: string, canonicalUrl: string, imageUrl: ?string}|null
     */
    public function resolve(string $propertyId): ?array
    {
        $listings = config('property_metadata.listings', []);
        $listing = is_array($listings) ? ($listings[$propertyId] ?? null) : null;
        if (! is_array($listing)
            || ($listing['approved'] ?? false) !== true
            || ($listing['indexable'] ?? false) !== true
            || ! is_string($listing['title'] ?? null)
            || trim($listing['title']) === ''
            || ! is_string($listing['description'] ?? null)
            || trim($listing['description']) === ''
        ) {
            return null;
        }

        $canonicalUrl = $this->canonicalUrl($propertyId);
        if ($canonicalUrl === null) {
            return null;
        }

        return [
            'title' => trim($listing['title']),
            'description' => trim($listing['description']),
            'canonicalUrl' => $canonicalUrl,
            'imageUrl' => $this->validatedImageUrl($listing['imageUrl'] ?? null),
        ];
    }

    private function validatedImageUrl(mixed $imageUrl): ?string
    {
        if (! is_string($imageUrl) || filter_var($imageUrl, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($imageUrl);
        if (! is_array($parts)
            || mb_strtolower($parts['scheme'] ?? '') !== 'https'
            || ! is_string($parts['host'] ?? null)
            || isset($parts['user'])
            || isset($parts['pass'])
        ) {
            return null;
        }

        return $imageUrl;
    }

    private function canonicalUrl(string $propertyId): ?string
    {
        $configuredUrl = config('app.url');
        if (! is_string($configuredUrl)) {
            return null;
        }

        $parts = parse_url($configuredUrl);
        if (! is_array($parts)
            || ! in_array(mb_strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || isset($parts['user'])
            || isset($parts['pass'])
        ) {
            return null;
        }

        $origin = $parts['scheme'].'://'.$parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':'.$parts['port'];
        }

        return $origin.'/apartamento/'.$propertyId;
    }
}
