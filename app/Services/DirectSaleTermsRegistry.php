<?php

namespace App\Services;

class DirectSaleTermsRegistry
{
    private const MAXIMUM_TERMS_FIELDS = 12;

    private const MAXIMUM_FIELD_LENGTH = 3_000;

    private const MAXIMUM_SNAPSHOT_LENGTH = 12_000;

    /** @return array<string, mixed>|null */
    public function findApprovedListing(string $listingId): ?array
    {
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $property = collect($catalog)->first(fn (array $item): bool => in_array($listingId, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));

        if ($property === null || ! $this->hasDisplayableTermsSnapshot($property)) {
            return null;
        }

        return $property;
    }

    /** @param array<string, mixed> $property */
    private function hasDisplayableTermsSnapshot(array $property): bool
    {
        $version = $property['directSaleTermsVersion'] ?? null;
        $snapshot = $property['directSaleTermsSnapshot'] ?? null;
        if (! is_string($version) || trim($version) === '' || mb_strlen($version) > 100 || ! is_array($snapshot)
            || ! is_string($snapshot['version'] ?? null)
            || ! hash_equals($version, $snapshot['version'])) {
            return false;
        }

        $fields = array_diff_key($snapshot, ['version' => true]);
        if ($fields === [] || count($fields) > self::MAXIMUM_TERMS_FIELDS) {
            return false;
        }

        $snapshotLength = 0;
        foreach ($fields as $name => $value) {
            if (! is_string($name) || trim($name) === '' || mb_strlen($name) > 100
                || ! is_string($value) || trim($value) === '' || mb_strlen($value) > self::MAXIMUM_FIELD_LENGTH) {
                return false;
            }

            $snapshotLength += mb_strlen($name) + mb_strlen($value);
            if ($snapshotLength > self::MAXIMUM_SNAPSHOT_LENGTH) {
                return false;
            }
        }

        return true;
    }
}
