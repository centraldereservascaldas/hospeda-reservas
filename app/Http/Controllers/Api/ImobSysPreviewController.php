<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImobSysPreviewRequest;
use App\Services\ImobSysSearchClient;
use Illuminate\Http\JsonResponse;

class ImobSysPreviewController extends Controller
{
    public function index(ImobSysPreviewRequest $request, ImobSysSearchClient $imobSys): JsonResponse
    {
        $input = $request->validated();
        $from = $input['from'];
        $to = $input['to'];
        if (strtotime($to) - strtotime($from) > 60 * 86400) {
            return response()->json(['success' => false, 'message' => 'Informe uma estadia de até 60 noites.'], 422);
        }
        $offers = $imobSys->offers($from, $to, (int) $input['guests'], $input['destination'] ?? '', $input['propertyId'] ?? null);
        if ($offers === null) {
            return response()->json(['success' => false, 'message' => 'Não foi possível consultar as ofertas da ImobSys.'], 503);
        }
        $properties = $imobSys->mapOffers($offers, $from, $to);
        $imobSys->rememberProperties($properties);

        return response()->json(['success' => true, 'source' => 'imobsys-live', 'total' => count($properties), 'data' => $properties]);
    }
}
