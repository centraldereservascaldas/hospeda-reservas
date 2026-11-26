<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiscoveryCampaignResource;
use App\Models\DiscoveryCampaign;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DiscoveryCampaignController extends Controller
{
    /**
     * Display a listing of active discovery campaigns for the Home page.
     */
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        $campaigns = DiscoveryCampaign::query()
            ->activeForDisplay()
            ->limit(10)
            ->get();

        return DiscoveryCampaignResource::collection($campaigns);
    }
}
