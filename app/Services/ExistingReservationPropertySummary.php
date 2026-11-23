<?php

namespace App\Services;

class ExistingReservationPropertySummary
{
    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysPublicContentMapper $mapper, private readonly StaysDiscoveryCatalog $discovery) {}

    /** @return array<string, mixed>|null */
    public function find(mixed $listingId): ?array
    {
        $snapshot = $this->snapshotProperty($listingId);
        if ($snapshot !== null && ! in_array('', $snapshot, true) && ! in_array([], $snapshot, true)) {
            return $snapshot;
        }

        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true);
        $property = collect(is_array($catalog) ? $catalog : [])->first(fn ($item) => is_array($item) && is_string($listingId) && in_array($listingId, [$item['id'] ?? null, $item['staysListingId'] ?? null], true));
        $property = is_array($property) ? $property : [];
        $listing = null;
        if (is_string($listingId) && preg_match('/^[a-f0-9]{24}$/iD', $listingId)) {
            $response = $this->stays->get('/content/listings/'.rawurlencode($listingId), timeout: 1);
            if (is_array($response) && in_array($listingId, [$response['_id'] ?? null, $response['id'] ?? null], true)) {
                $listing = $response;
            }
        }
        if ($property === [] && $listing === null) {
            return $snapshot;
        }
        $listingImages = $this->images($listing ?? []);
        $catalogImages = array_values(array_filter(array_map(fn ($url) => $this->mapper->image($url), is_array($property['images'] ?? null) ? $property['images'] : [])));
        $images = $listingImages !== [] ? $listingImages : array_slice($catalogImages, 0, 12);
        $propertyId = $listing['_idproperty'] ?? null;
        $condo = null;
        if (is_string($propertyId) && preg_match('/^[a-f0-9]{24}$/iD', $propertyId)) {
            $response = $this->stays->get('/content/properties/'.rawurlencode($propertyId), timeout: 1);
            if (is_array($response) && in_array($propertyId, [$response['_id'] ?? null, $response['id'] ?? null], true)) {
                $condo = $response;
            }
        }

        $fallback = [
            'title' => $this->mapper->text($listing['_mstitle'] ?? null) ?: $this->mapper->text($property['title'] ?? null),
            'images' => $images,
            'description' => mb_substr($this->mapper->text($listing['_msdesc'] ?? null) ?: $this->mapper->text($property['description'] ?? null), 0, 15000),
            'condoTitle' => $this->mapper->text($condo['_mstitle'] ?? null),
            'condoDescription' => mb_substr($this->mapper->text($condo['_msdesc'] ?? null), 0, 15000),
            'condoImages' => $this->images($condo ?? []),
        ];

        if ($snapshot === null) {
            return $fallback;
        }

        foreach ($fallback as $field => $value) {
            if (($snapshot[$field] ?? null) === '' || ($snapshot[$field] ?? null) === [] || ($snapshot[$field] ?? null) === null) {
                $snapshot[$field] = $value;
            }
        }

        return $snapshot;
    }

    /** @return array<string, mixed>|null */
    private function snapshotProperty(mixed $listingId): ?array
    {
        if (! is_string($listingId) || ! preg_match('/^[a-f0-9]{24}$/iD', $listingId)) {
            return null;
        }
        try {
            $snapshot = $this->discovery->snapshot();
        } catch (\Throwable) {
            return null;
        }
        $listings = is_array($snapshot['listings'] ?? null) ? $snapshot['listings'] : [];
        $listing = collect($listings)->first(fn (mixed $item): bool => is_array($item)
            && in_array($listingId, [$item['id'] ?? null, $item['objectId'] ?? null], true));
        if (! is_array($listing)) {
            return null;
        }
        $properties = is_array($snapshot['properties'] ?? null) ? $snapshot['properties'] : [];
        $property = $properties[$listing['propertyId'] ?? ''] ?? null;
        $property = is_array($property) ? $property : [];
        $sanitizeImages = fn (mixed $images): array => array_slice(array_values(array_unique(array_filter(array_map(
            fn (mixed $url) => $this->mapper->image($url), is_array($images) ? $images : [],
        )))), 0, 12);

        return [
            'title' => $this->mapper->text($listing['name'] ?? null),
            'images' => $sanitizeImages($listing['images'] ?? []),
            'description' => mb_substr($this->mapper->text($listing['description'] ?? null), 0, 15000),
            'condoTitle' => $this->mapper->text($property['name'] ?? null),
            'condoDescription' => mb_substr($this->mapper->text($property['description'] ?? null), 0, 15000),
            'condoImages' => $sanitizeImages($property['images'] ?? []),
        ];
    }

    /** @param array<string, mixed> $content
     * @return list<string>
     */
    private function images(array $content): array
    {
        $metadata = is_array($content['_t_imagesMeta'] ?? null) ? $content['_t_imagesMeta'] : [];
        $urls = [$content['_t_mainImageMeta']['url'] ?? null];
        foreach ($metadata as $image) {
            $urls[] = is_array($image) ? ($image['url'] ?? null) : null;
        }

        return array_slice(array_values(array_unique(array_filter(array_map(fn ($url) => $this->mapper->image($url), $urls)))), 0, 12);
    }
}
