<?php

namespace App\Services;

use Illuminate\Support\Str;

class StaysPublicContentMapper
{
    public function text(mixed $value): string
    {
        if (is_array($value)) {
            $value = $value['pt_BR'] ?? $value['pt-BR'] ?? $value['pt'] ?? '';
        }
        if (! is_string($value)) {
            return '';
        }
        $value = preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', '', $value) ?? '';
        $value = preg_replace('~<(?:br\s*/?|/p|/div|/li)>~i', "\n", $value) ?? '';

        return trim(preg_replace('/[\t ]+/', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    }

    public function identifier(mixed $value): string
    {
        return is_string($value) && preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $value) === 1 ? $value : '';
    }

    public function image(mixed $value): ?string
    {
        if (! is_string($value) || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return null;
        }
        $parts = parse_url($value);
        $host = mb_strtolower($parts['host'] ?? '');
        if (($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass'])
            || $host === 'localhost' || str_ends_with($host, '.local')
            || (filter_var($host, FILTER_VALIDATE_IP) && ! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))) {
            return null;
        }

        return $value;
    }

    /** @param array<string, mixed> $raw
     * @param  array<string, string>  $dictionary
     * @return array<string, mixed>|null
     */
    public function map(array $raw, array $dictionary, bool $listing): ?array
    {
        if (($raw['status'] ?? null) !== 'active') {
            return null;
        }
        if ($listing && ! in_array('vacationRental', $raw['listingCategories'] ?? [], true)) {
            return null;
        }
        $id = $this->identifier($listing ? ($raw['id'] ?? $raw['_id'] ?? null) : ($raw['_id'] ?? $raw['id'] ?? null));
        $title = preg_replace('/^CRCN\s*[-–:]\s*/iu', '', $this->text($raw['_mstitle'] ?? null)) ?? '';
        if ($id === '' || $title === '') {
            return null;
        }
        $description = $this->text($raw['_msdesc'] ?? null);
        $images = [];
        foreach ([$raw['_t_mainImageMeta']['url'] ?? null, ...array_column($raw['_t_imagesMeta'] ?? [], 'url')] as $url) {
            $image = $this->image($url);
            if ($image !== null) {
                $images[] = $image;
            }
        }
        $amenities = [];
        foreach ($raw['amenities'] ?? [] as $item) {
            $amenityId = is_array($item) ? ($item['_id'] ?? $item['id'] ?? '') : $item;
            $label = is_array($item) ? $this->text($item['_mstitle'] ?? null) : '';
            $label = $label ?: (is_string($amenityId) ? ($dictionary[$amenityId] ?? '') : '');
            if ($label !== '') {
                $amenities[] = $label;
            }
        }
        $city = $this->text($raw['address']['city'] ?? null);
        $images = array_values(array_unique($images));
        $guests = filter_var($raw['_i_maxGuests'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);

        return [
            'id' => $id,
            'objectId' => $this->identifier($raw['_id'] ?? null),
            'propertyId' => $listing ? $this->identifier($raw['_idproperty'] ?? null) : null,
            'name' => $title,
            'slug' => Str::slug($title) ?: $id,
            'description' => $description,
            'city' => $city,
            'state' => $this->text($raw['address']['stateCode'] ?? null),
            'neighborhood' => $this->text($raw['address']['region'] ?? null),
            'images' => array_slice($images, 0, 12),
            'amenities' => array_values(array_unique($amenities)),
            'maxGuests' => $listing && $guests !== false ? $guests : null,
            'bedrooms' => $this->nonNegativeNumber($raw['_i_rooms'] ?? null),
            'beds' => $this->nonNegativeNumber($raw['_i_beds'] ?? null),
            'bathrooms' => $this->nonNegativeNumber($raw['_f_bathrooms'] ?? null),
            'indexable' => mb_strlen($description) >= 150 && $images !== [] && $city !== '' && (! $listing || $guests !== false),
        ];
    }

    private function nonNegativeNumber(mixed $value): int|float|null
    {
        return is_numeric($value) && (float) $value >= 0 && (float) $value <= 100 ? $value + 0 : null;
    }
}
