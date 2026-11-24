<?php

namespace App\Http\Requests;

use App\Services\ExistingCheckoutRecoveryCredential;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RecoverExistingReservationCheckoutRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['recoverySecret' => $this->header('X-Checkout-Recovery-Secret')]);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return ['recoverySecret' => ['required', 'string', function (string $attribute, mixed $value, \Closure $fail): void {
            if (! is_string($value) || ! app(ExistingCheckoutRecoveryCredential::class)->valid((string) $this->route('code'), $value)) {
                $fail('A credencial de recuperação é inválida.');
            }
        }]];
    }
}
