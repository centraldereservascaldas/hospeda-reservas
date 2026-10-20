<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreOwnerCalendarBlockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'listingId' => ['required', 'string', 'max:160'],
            'from' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'reason' => ['nullable', 'string', 'max:140'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['from', 'to'])) {
                return;
            }

            if (now()->parse($this->string('from'))->diffInDays(now()->parse($this->string('to'))) > 366) {
                $validator->errors()->add('to', 'O bloqueio não pode ultrapassar 12 meses.');
            }
        }];
    }
}
