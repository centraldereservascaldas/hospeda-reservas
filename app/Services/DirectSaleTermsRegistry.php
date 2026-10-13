<?php

namespace App\Services;

class DirectSaleTermsRegistry
{
    /** @return array<string, mixed>|null */
    public function findApprovedListing(string $listingId): ?array
    {
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $property = collect($catalog)->first(fn (array $item): bool => in_array($listingId, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));

        if ($property === null
            || ! is_string($property['directSaleTermsVersion'] ?? null)
            || ! is_array($property['directSaleTermsSnapshot'] ?? null)
            || ! is_string($property['directSaleTermsSnapshot']['version'] ?? null)
            || ! hash_equals($property['directSaleTermsVersion'], $property['directSaleTermsSnapshot']['version'])
            || array_diff_key($property['directSaleTermsSnapshot'], ['version' => true]) === []) {
            return null;
        }

        return $property;
    }
}
