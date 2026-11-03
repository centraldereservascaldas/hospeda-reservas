<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreCheckoutPaymentRequest extends FormRequest
{
    private const MAX_CARD_INSTALLMENTS = 6;

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
            'installments' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_CARD_INSTALLMENTS, 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'cardholderName' => ['nullable', 'string', 'max:150', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'cardholderEmail' => ['nullable', 'email:rfc', 'max:255', 'required_if:paymentMethod,card', 'prohibited_if:paymentMethod,pix'],
            'issuerId' => ['nullable', 'integer', 'min:1', 'prohibited_if:paymentMethod,pix'],
            'payerIdentification' => ['nullable', 'array:type,number', 'required_if:paymentMethod,card', Rule::requiredIf(fn (): bool => $this->input('paymentMethod') === 'pix' && config('services.cielo.direct_environment') === 'production')],
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
            if (! $validator->errors()->hasAny(['payerIdentification', 'payerIdentification.type', 'payerIdentification.number'])
                && is_array($this->input('payerIdentification'))) {
                $type = $this->input('payerIdentification.type');
                $number = $this->input('payerIdentification.number');
                if (strlen((string) $number) !== ($type === 'CPF' ? 11 : 14)) {
                    $validator->errors()->add('payerIdentification.number', 'Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.');
                }
            }
        }];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['idempotencyKey' => $this->header('Idempotency-Key')]);
    }
}
