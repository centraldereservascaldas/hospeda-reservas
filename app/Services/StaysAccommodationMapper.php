<?php

namespace App\Services;

use RuntimeException;

class StaysAccommodationMapper
{
    /** @var array<string, string> */
    private array $amenityNameDictionary = [];

    private bool $amenityNameDictionaryLoaded = false;

    /** @var array<string, array<string, mixed>> */
    private array $staysPropertiesById = [];

    private bool $staysPropertyCatalogLoaded = false;

    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysDiscoveryCatalog $discovery) {}

    private bool $requireCompleteMetadata = false;

    public function reset(): void
    {
        $this->amenityNameDictionary = [];
        $this->amenityNameDictionaryLoaded = false;
        $this->staysPropertiesById = [];
        $this->staysPropertyCatalogLoaded = false;
    }

    public function localized(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }
        if (is_array($value)) {
            return (string) ($value['pt_BR'] ?? $value['pt-BR'] ?? $value['pt'] ?? reset($value) ?: '');
        }

        return '';
    }

    /** @return array<int, string> */
    private function mapAmenityNames(mixed $amenities): array
    {
        if (! is_array($amenities)) {
            return [];
        }

        return collect($amenities)
            ->map(function (mixed $amenity): ?string {
                if (is_string($amenity)) {
                    return trim($amenity) !== '' ? trim($amenity) : null;
                }
                if (! is_array($amenity)) {
                    return null;
                }

                $name = $this->localized($amenity['_mstitle'] ?? null) ?: (string) ($amenity['name'] ?? '');
                if (trim($name) !== '') {
                    return trim($name);
                }

                $id = (string) ($amenity['_id'] ?? $amenity['id'] ?? '');

                return $id !== '' ? ($this->amenityNameDictionary()[$id] ?? null) : null;
            })
            ->filter(fn (?string $name): bool => $name !== null && $name !== '')
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<string, string> */
    private function amenityNameDictionary(): array
    {
        if ($this->amenityNameDictionaryLoaded) {
            return $this->amenityNameDictionary;
        }

        $this->amenityNameDictionaryLoaded = true;
        foreach (['/translation/listing-amenities', '/translation/property-amenities'] as $endpoint) {
            $amenities = $this->stays->get($endpoint);
            if ($this->requireCompleteMetadata && (! is_array($amenities) || ! array_is_list($amenities))) {
                throw new RuntimeException('Accommodation amenity metadata is unavailable.');
            }
            foreach (is_array($amenities) ? $amenities : [] as $amenity) {
                if (! is_array($amenity)) {
                    continue;
                }

                $id = (string) ($amenity['_id'] ?? '');
                $name = $this->localized($amenity['_mstitle'] ?? null);
                if ($id !== '' && trim($name) !== '') {
                    $this->amenityNameDictionary[$id] = trim($name);
                }
            }
        }

        return $this->amenityNameDictionary;
    }

    /** @return array<string, mixed> */
    private function staysPropertyById(string $propertyId): array
    {
        if ($propertyId === '') {
            return [];
        }

        if (! $this->staysPropertyCatalogLoaded) {
            $this->staysPropertyCatalogLoaded = true;
            for ($skip = 0; $skip < 5000; $skip += 100) {
                $page = $this->stays->get('/content/properties', [
                    'limit' => 100,
                    'skip' => $skip,
                    'status' => 'active',
                ]);
                if ($this->requireCompleteMetadata && (! is_array($page) || ! array_is_list($page) || array_filter($page, 'is_array') !== $page)) {
                    throw new RuntimeException('Accommodation property metadata is unavailable.');
                }
                if (! is_array($page)) {
                    break;
                }

                foreach ($page as $property) {
                    if (! is_array($property)) {
                        continue;
                    }

                    foreach ([(string) ($property['_id'] ?? ''), (string) ($property['id'] ?? '')] as $id) {
                        if ($id !== '') {
                            $this->staysPropertiesById[$id] = $property;
                        }
                    }
                }

                if (count($page) < 100) {
                    break;
                }
            }
        }

        return $this->staysPropertiesById[$propertyId] ?? [];
    }

    public function map(array $listing, array $catalog, bool $requireCompleteMetadata = false): array
    {
        $this->requireCompleteMetadata = $requireCompleteMetadata;
        $id = (string) ($listing['id'] ?? $listing['code'] ?? $listing['_id'] ?? '');
        $listingIds = array_values(array_filter([
            (string) ($listing['id'] ?? ''),
            (string) ($listing['code'] ?? ''),
            (string) ($listing['_id'] ?? ''),
        ]));
        $existing = collect($catalog)->first(function (array $item) use ($listingIds): bool {
            $catalogIds = array_filter([
                $item['id'] ?? null,
                $item['staysListingId'] ?? null,
                $item['staysListingObjectId'] ?? null,
            ], 'is_string');

            return array_intersect($listingIds, $catalogIds) !== [];
        }) ?? [];
        $hasMatchingCatalogEntry = $existing !== [] && ($existing['staysListingId'] ?? null) === ($listing['id'] ?? $listing['code'] ?? null);
        if (! $hasMatchingCatalogEntry) {
            $existing = [];
        }
        $location = $existing['location'] ?? [];
        $address = $listing['address'] ?? [];
        $latLng = $listing['latLng'] ?? [];
        $subtype = strtolower((string) ($listing['subtype'] ?? ''));
        $propertyType = match ($subtype) {
            'private_room', 'private-room', 'room' => 'private_room',
            'cabin' => 'cabin',
            'villa' => 'villa',
            default => 'entire_place',
        };
        $gallery = collect($listing['_t_imagesMeta'] ?? [])->map(fn ($image) => is_array($image) ? ($image['url'] ?? $image['src'] ?? null) : $image);
        $images = collect([$listing['_t_mainImageMeta']['url'] ?? null, ...$gallery->all(), ...($listing['images'] ?? [])])
            ->filter(fn ($image): bool => is_string($image) && $image !== '')
            ->unique()->values()->all();
        $listingAmenities = $this->mapAmenityNames($listing['amenities'] ?? []);
        if ($listingAmenities === [] && $hasMatchingCatalogEntry) {
            $listingAmenities = $existing['listingAmenities'] ?? [];
        }
        $propertyAmenityItems = $listing['propertyAmenities'] ?? [];
        if ($propertyAmenityItems === []) {
            $propertyAmenityItems = $this->staysPropertyById((string) ($listing['_idproperty'] ?? ''))['amenities'] ?? [];
        }
        $propertyAmenities = $this->mapAmenityNames($propertyAmenityItems);
        if ($propertyAmenities === [] && $hasMatchingCatalogEntry) {
            $propertyAmenities = $existing['propertyAmenities'] ?? [];
        }
        $amenities = collect([
            ...($hasMatchingCatalogEntry ? ($existing['amenities'] ?? []) : []),
            ...$listingAmenities,
            ...$propertyAmenities,
        ])->filter(fn ($amenity): bool => is_string($amenity) && trim($amenity) !== '')
            ->unique()->values()->all();

        $snapshot = $this->discovery->snapshot();
        $complex = $snapshot['properties'][(string) ($listing['_idproperty'] ?? '')] ?? null;
        $publicListing = $snapshot['listings'][(string) ($listing['id'] ?? $id)] ?? null;

        $mappedProperty = array_replace_recursive($existing, [
            'id' => $id, 'staysListingId' => (string) ($listing['id'] ?? $listing['code'] ?? $id), 'staysListingObjectId' => (string) ($listing['_id'] ?? ''), 'staysPropertyId' => (string) ($listing['_idproperty'] ?? ''), 'staysSynced' => true,
            'publicPagePath' => $publicListing !== null ? $this->discovery->listingPath($publicListing) : '',
            'title' => $this->localized($listing['_mstitle'] ?? null) ?: ($listing['internalName'] ?? 'Apartamento Central de Reservas'),
            'subtitle' => $this->localized($listing['_t_typeMeta']['_mstitle'] ?? null) ?: ($hasMatchingCatalogEntry ? ($existing['subtitle'] ?? '') : ''),
            'description' => strip_tags($this->localized($listing['_msdesc'] ?? $listing['description'] ?? null) ?: ($hasMatchingCatalogEntry ? ($existing['description'] ?? '') : '')),
            'complexName' => $complex['name'] ?? ($hasMatchingCatalogEntry ? ($existing['complexName'] ?? '') : ''),
            'complexPageUrl' => $complex !== null && ($complex['listingIds'] ?? []) !== [] ? $this->discovery->propertyPath($complex) : '',
            'complexDescription' => $complex['description'] ?? ($hasMatchingCatalogEntry ? ($existing['complexDescription'] ?? '') : ''),
            'complexImages' => $complex['images'] ?? ($hasMatchingCatalogEntry ? ($existing['complexImages'] ?? []) : []),
            'category' => (string) (collect($listing['listingCategories'] ?? [])->first() ?? 'accommodation'),
            'propertyType' => $propertyType,
            'location' => [
                'city' => $address['city'] ?? $location['city'] ?? '', 'state' => $address['state'] ?? $address['stateCode'] ?? $location['state'] ?? '',
                'country' => ($address['countryCode'] ?? null) === 'BR' ? 'Brasil' : ($location['country'] ?? ''), 'neighborhood' => $address['region'] ?? $address['neighborhood'] ?? $location['neighborhood'] ?? '',
                'address' => trim(implode(', ', array_filter([$address['street'] ?? null, $address['streetNumber'] ?? null]))), 'lat' => $latLng['_f_lat'] ?? $latLng['lat'] ?? $location['lat'] ?? 0, 'lng' => $latLng['_f_lng'] ?? $latLng['lng'] ?? $location['lng'] ?? 0,
            ],
            'pricePerNight' => $listing['dailyRate'] ?? $listing['price'] ?? 0,
            'cleaningFee' => $listing['cleaningFee'] ?? 0, 'serviceFeeRate' => 0,
            'rating' => 0, 'reviewCount' => 0, 'isSuperhost' => false, 'isGuestFavorite' => false,
            'instantBook' => $listing['instantBooking'] ?? false,
            'images' => $images, 'bedrooms' => $listing['_i_rooms'] ?? 0,
            'beds' => $listing['_i_beds'] ?? 0, 'bathrooms' => $listing['_f_bathrooms'] ?? 0,
            'maxGuests' => max(1, (int) ($listing['_i_maxGuests'] ?? 1)),
            'listingAmenities' => $listingAmenities, 'propertyAmenities' => $propertyAmenities,
            'amenities' => $amenities, 'highlights' => [], 'sleepingArrangements' => [], 'rules' => [], 'host' => ['name' => '', 'avatar' => '', 'joinedYear' => 0, 'isSuperhost' => false, 'responseTime' => '', 'responseRate' => '', 'bio' => ''], 'reviews' => [],
        ]);

        $mappedProperty['listingAmenities'] = $listingAmenities;
        $mappedProperty['propertyAmenities'] = $propertyAmenities;
        $mappedProperty['amenities'] = $amenities;

        return $mappedProperty;
    }
}
