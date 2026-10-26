<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\LegalPageRegistry;
use Illuminate\Http\JsonResponse;

class PublicLegalPageController extends Controller
{
    public function __construct(private LegalPageRegistry $legalPages) {}

    public function index(): JsonResponse
    {
        return response()->json(['pages' => $this->legalPages->all()])
            ->header('Cache-Control', 'no-store, private');
    }

    public function show(string $slug): JsonResponse
    {
        $page = $this->legalPages->find($slug);
        if ($page === null) {
            abort(404);
        }

        return response()->json(['page' => $page])
            ->header('Cache-Control', 'no-store, private');
    }
}
