<?php

namespace App\Http\Resources;

use App\Models\DiscoveryCampaign;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin DiscoveryCampaign
 */
class DiscoveryCampaignResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->slug,
            'title' => $this->title,
            'eyebrow' => $this->eyebrow,
            'description' => $this->description,
            'checkIn' => $this->check_in?->format('Y-m-d'),
            'checkOut' => $this->check_out?->format('Y-m-d'),
            'kind' => $this->kind,
            'weight' => $this->weight,
        ];
    }
}
