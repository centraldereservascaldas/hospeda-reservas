<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PropertyMetadataResolver;
use Illuminate\Http\JsonResponse;

class PropertyMetadataController extends Controller
{
    public function __construct(private PropertyMetadataResolver $metadataResolver) {}

    public function show(string $id): JsonResponse
    {
        $metadata = $this->metadataResolver->resolve($id);
        if ($metadata === null) {
            return response()->json(['approved' => false])->header('Cache-Control', 'no-store');
        }

        return response()->json([
            'approved' => true,
            ...$metadata,
        ])->header('Cache-Control', 'no-store');
    }
}
