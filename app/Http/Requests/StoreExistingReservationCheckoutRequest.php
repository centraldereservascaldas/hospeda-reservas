<?php

namespace App\Http\Requests;

use App\Rules\ValidCpf;
use App\Services\ExistingCheckoutRecoveryCredential;
use Illuminate\Foundation\Http\FormRequest;

class StoreExistingReservationCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['idempotencyKey' => $this->header('Idempotency-Key'), 'recoverySecret' => $this->header('X-Checkout-Recovery-Secret')]);
    }

    public function rules(): array
    {
        return [
            'idempotencyKey' => ['required', 'string', 'min:16', 'max:128', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'recoverySecret' => ['nullable', 'string', function (string $attribute, mixed $value, \Closure $fail): void {
                if ($value !== null && (! is_string($value) || ! app(ExistingCheckoutRecoveryCredential::class)->valid((string) $this->route('code'), $value))) {
                    $fail('A credencial de recuperação é inválida.');
                }
            }],
            'expectedBalanceCents' => ['required', 'integer', 'min:1', 'max:9999999999'],
            'paymentMethod' => ['required', 'in:pix,card'],
            'paymentPlan' => ['sometimes', 'in:full,deposit'],
            'installments' => ['nullable', 'integer', 'min:1', 'max:6', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'guest' => ['required', 'array:fullName,email,phone,cpf'],
            'guest.fullName' => ['required', 'string', 'max:180'],
            'guest.email' => ['required', 'email:rfc', 'max:254'],
            'guest.phone' => ['required', 'string', 'max:40'],
            'guest.cpf' => ['sometimes', 'required', 'string', 'regex:/^[0-9]{11}$/', new ValidCpf],
            'acceptedPayment' => ['required', 'accepted'],
            'acceptedContract' => ['sometimes', 'required', 'array:version,contentHash'],
            'acceptedContract.version' => ['required_with:acceptedContract', 'string', 'max:100'],
            'acceptedContract.contentHash' => ['required_with:acceptedContract', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ];
    }
}
