<?php

namespace App\Http\Requests;

use App\Services\MoneyAmount;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCheckoutRequest extends FormRequest
{
    private const MARKETING_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    private const MARKETING_ATTRIBUTION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

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
            'guest' => ['required', 'array:fullName,email,phone,cpf'],
            'guest.fullName' => ['required', 'string', 'max:180'],
            'guest.email' => ['required', 'email', 'max:254'],
            'guest.phone' => ['required', 'string', 'max:40'],
            'guest.cpf' => ['nullable', 'string', 'regex:/^[0-9]{11}$/'],
            'acceptedTermsVersion' => ['required', 'string', 'max:100'],
            'acceptedTerms' => ['required', 'accepted'],
            'marketingAttribution' => ['sometimes', 'nullable', 'array:firstTouch,lastTouch'],
            'marketingAttribution.firstTouch' => ['required_with:marketingAttribution', 'array:capturedAt,values'],
            'marketingAttribution.firstTouch.capturedAt' => ['required_with:marketingAttribution.firstTouch', 'integer', 'min:1'],
            'marketingAttribution.firstTouch.values' => ['required_with:marketingAttribution.firstTouch', 'array:utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,fbclid'],
            'marketingAttribution.lastTouch' => ['required_with:marketingAttribution', 'array:capturedAt,values'],
            'marketingAttribution.lastTouch.capturedAt' => ['required_with:marketingAttribution.lastTouch', 'integer', 'min:1'],
            'marketingAttribution.lastTouch.values' => ['required_with:marketingAttribution.lastTouch', 'array:utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,fbclid'],
            'marketingAttribution.firstTouch.values.utm_source' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.firstTouch.values.utm_medium' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.firstTouch.values.utm_campaign' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.firstTouch.values.utm_content' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.firstTouch.values.utm_term' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.firstTouch.values.gclid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.firstTouch.values.gbraid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.firstTouch.values.wbraid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.firstTouch.values.fbclid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.lastTouch.values.utm_source' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.lastTouch.values.utm_medium' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.lastTouch.values.utm_campaign' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.lastTouch.values.utm_content' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.lastTouch.values.utm_term' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/', 'not_regex:/^[0-9]{7,}$/'],
            'marketingAttribution.lastTouch.values.gclid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.lastTouch.values.gbraid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.lastTouch.values.wbraid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'marketingAttribution.lastTouch.values.fbclid' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9._~-]+$/'],
            'idempotencyKey' => ['required', 'string', 'min:16', 'max:128', 'regex:/^[A-Za-z0-9._~-]+$/'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if (! $validator->errors()->has('quoteTotal') && MoneyAmount::toCents($this->input('quoteTotal')) === null) {
                $validator->errors()->add('quoteTotal', 'Informe o total com no máximo duas casas decimais.');
            }

            if ($this->input('marketingAttribution') === null) {
                return;
            }

            $now = now()->valueOf();
            $oldestAcceptedTimestamp = $now - self::MARKETING_ATTRIBUTION_TTL_MS;
            $latestAcceptedTimestamp = $now + self::MARKETING_ATTRIBUTION_FUTURE_TOLERANCE_MS;

            foreach (['firstTouch', 'lastTouch'] as $touch) {
                $attribute = "marketingAttribution.{$touch}.capturedAt";
                if ($validator->errors()->has($attribute)) {
                    continue;
                }

                $capturedAt = $this->input($attribute);
                if (! is_numeric($capturedAt) || $capturedAt <= $oldestAcceptedTimestamp || $capturedAt > $latestAcceptedTimestamp) {
                    $validator->errors()->add($attribute, 'A data da atribuição deve estar dentro dos últimos 30 dias e não pode estar mais de 5 minutos no futuro.');
                }
            }
        }];
    }
}
