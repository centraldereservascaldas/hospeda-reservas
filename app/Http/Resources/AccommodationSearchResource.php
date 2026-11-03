<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccommodationSearchResource extends JsonResource
{
    public static $wrap = null;

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'success' => true,
            'source' => 'stays-live',
            'total' => count($this->resource['data']),
            'from' => $this->resource['from'],
            'to' => $this->resource['to'],
            'guests' => $this->resource['guests'],
            'data' => $this->resource['data'],
            'unquotedCount' => $this->resource['unquotedCount'],
            'meta' => $this->resource['meta'],
            'pagination' => $this->resource['pagination'],
        ];
    }
}
