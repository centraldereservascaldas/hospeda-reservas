<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StartStaysCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'listingId' => ['required', 'string', 'max:100'],
            'from' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'guests' => ['required', 'integer', 'min:1', 'max:50'],
            'quoteTotal' => ['required', 'numeric', 'gt:0', 'max:99999999.99'],
            'guest' => ['required', 'array:fullName,email'],
            'guest.fullName' => ['required', 'string', 'max:180', 'regex:/^\S{2,}(?:\s+\S{2,})+$/u'],
            'guest.email' => ['required', 'email', 'max:254'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'guest.fullName.regex' => 'Informe nome e sobrenome para continuar na Stays.',
        ];
    }
}
