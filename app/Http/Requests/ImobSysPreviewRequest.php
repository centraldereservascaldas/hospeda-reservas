<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImobSysPreviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return app()->environment(['local', 'testing']) || (bool) config('services.partner_api.search_fallback_enabled');
    }

    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'guests' => ['required', 'integer', 'min:1', 'max:10'],
            'destination' => ['nullable', 'string', 'max:160'],
            'propertyId' => [app()->environment(['local', 'testing']) ? 'nullable' : 'required', 'string', 'regex:/^imobsys-crcn-[1-9]\d{0,8}-[1-9]\d{0,11}$/D'],
        ];
    }
}
