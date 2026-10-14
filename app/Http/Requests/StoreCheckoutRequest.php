<?php

namespace App\Http\Requests;

use App\Services\MoneyAmount;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCheckoutRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['idempotencyKey' => $this->header('Idempotency-Key')]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'listingId' => ['required', 'string', 'max:100'],
            'from' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'guests' => ['required', 'array:adults,children,infants,pets'],
            'guests.adults' => ['required', 'integer', 'min:1', 'max:50'],
            'guests.children' => ['required', 'integer', 'min:0', 'max:50'],
            'guests.infants' => ['required', 'integer', 'min:0', 'max:50'],
            'guests.pets' => ['required', 'integer', 'min:0', 'max:20'],
            'quoteTotal' => ['required', 'numeric', 'gt:0', 'max:99999999.99'],
            'guest' => ['required', 'array:fullName,email,phone'],
            'guest.fullName' => ['required', 'string', 'max:180'],
            'guest.email' => ['required', 'email', 'max:254'],
            'guest.phone' => ['required', 'string', 'max:40'],
            'acceptedTermsVersion' => ['required', 'string', 'max:100'],
            'acceptedTerms' => ['required', 'accepted'],
            'idempotencyKey' => ['required', 'string', 'min:16', 'max:128', 'regex:/^[A-Za-z0-9._~-]+$/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->has('quoteTotal')) {
                return;
            }

            if (MoneyAmount::toCents($this->input('quoteTotal')) === null) {
                $validator->errors()->add('quoteTotal', 'Informe o total com no máximo duas casas decimais.');
            }
        }];
    }
}
