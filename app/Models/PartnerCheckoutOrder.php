<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PartnerCheckoutOrder extends Model
{
    use HasUuids;

    protected $guarded = ['id'];

    protected $hidden = ['encrypted_customer', 'reservation_idempotency_key', 'public_reference', 'payment_qr_code'];

    protected function casts(): array
    {
        return ['encrypted_customer' => 'encrypted:array', 'payment_qr_code' => 'encrypted', 'check_in' => 'date', 'check_out' => 'date'];
    }
}
