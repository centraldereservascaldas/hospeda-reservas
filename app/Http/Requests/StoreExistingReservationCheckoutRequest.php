<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreExistingReservationCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['idempotencyKey' => $this->header('Idempotency-Key')]);
    }

    public function rules(): array
    {
        return [
            'idempotencyKey' => ['required', 'string', 'min:16', 'max:128', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'expectedBalanceCents' => ['required', 'integer', 'min:1', 'max:9999999999'],
            'paymentMethod' => ['required', 'in:pix,card'],
            'installments' => ['nullable', 'integer', 'min:1', 'max:6', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'guest' => ['required', 'array:fullName,email,phone'],
            'guest.fullName' => ['required', 'string', 'max:180'],
            'guest.email' => ['required', 'email:rfc', 'max:254'],
            'guest.phone' => ['required', 'string', 'max:40'],
            'acceptedPayment' => ['required', 'accepted'],
        ];
    }
}
