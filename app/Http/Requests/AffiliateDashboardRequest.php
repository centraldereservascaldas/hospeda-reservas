<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AffiliateDashboardRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'listingId' => ['sometimes', 'string', 'max:100'],
            'commissionStatus' => ['sometimes', Rule::in(['pending', 'review', 'approved', 'paid'])],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => array_merge(
                ['sometimes', 'date_format:Y-m-d'],
                $this->filled('from') ? ['after_or_equal:from'] : [],
            ),
        ];
    }
}
