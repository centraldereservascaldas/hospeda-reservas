<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AcceptExistingReservationContractRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'accepted' => ['required', 'accepted'],
            'version' => ['required', 'string', 'max:100'],
            'contentHash' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ];
    }
}
