<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCheckoutPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'idempotencyKey' => ['required', 'string', 'min:16', 'max:128', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'paymentMethod' => ['required', 'in:pix,card'],
            'paymentMethodId' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9_-]+$/'],
            'token' => ['nullable', 'string', 'max:255', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'installments' => ['nullable', 'integer', 'min:1', 'max:12', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'issuerId' => ['nullable', 'integer', 'min:1'],
            'payerIdentification' => ['nullable', 'array:type,number'],
            'payerIdentification.type' => ['required_with:payerIdentification', 'string', 'in:CPF,CNPJ'],
            'payerIdentification.number' => ['required_with:payerIdentification', 'string', 'max:20', 'regex:/^[0-9]+$/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['paymentMethod', 'paymentMethodId'])) {
                return;
            }

            $paymentMethod = $this->string('paymentMethod')->toString();
            $paymentMethodId = $this->string('paymentMethodId')->toString();
            if (($paymentMethod === 'pix') !== ($paymentMethodId === 'pix')) {
                $validator->errors()->add('paymentMethodId', 'O meio de pagamento não corresponde ao tipo selecionado.');
            }
        }];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['idempotencyKey' => $this->header('Idempotency-Key')]);
    }
}
