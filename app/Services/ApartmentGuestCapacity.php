<?php

namespace App\Services;

class ApartmentGuestCapacity
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    public function forListingId(string $listingId): ?int
    {
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true);
        $property = collect(is_array($catalog) ? $catalog : [])->first(
            fn (mixed $item): bool => is_array($item)
                && in_array($listingId, [$item['id'] ?? null, $item['staysListingId'] ?? null, $item['staysListingObjectId'] ?? null], true),
        );
        $capacity = $this->validCapacity(is_array($property) ? ($property['maxGuests'] ?? null) : null);
        if ($capacity !== null) {
            return $capacity;
        }

        $listing = $this->stays->get('/content/listings/'.rawurlencode($listingId));
        if (! is_array($listing) || ! in_array($listingId, [
            $listing['_id'] ?? null,
            $listing['id'] ?? null,
            $listing['code'] ?? null,
        ], true)) {
            return null;
        }

        return $this->validCapacity($listing['_i_maxGuests'] ?? $listing['maxGuests'] ?? null);
    }

    private function validCapacity(mixed $value): ?int
    {
        $capacity = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 50]]);

        return $capacity === false ? null : $capacity;
    }
}
