<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SearchAccommodationsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'required_with:to', 'date_format:Y-m-d'],
            'to' => ['nullable', 'required_with:from', 'date_format:Y-m-d'],
            'guests' => ['nullable', 'integer', 'min:1', 'max:50'],
            'destination' => ['nullable', 'string', 'max:160'],
            'propertyId' => ['nullable', 'string', 'max:100'],
            'cities' => ['nullable', 'array', 'max:10'],
            'cities.*' => ['string', 'max:160', 'distinct'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'purpose' => ['nullable', 'in:search,discovery'],
            'skip' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'from.required_with' => 'Informe entrada e saída para pesquisar disponibilidade.',
            'to.required_with' => 'Informe entrada e saída para pesquisar disponibilidade.',
        ];
    }
}
