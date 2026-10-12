<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuestProfile extends Model
{
    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'full_name', 'stays_client_id', 'stays_synced_at'];

    protected function casts(): array
    {
        return ['stays_synced_at' => 'immutable_datetime'];
    }
}
