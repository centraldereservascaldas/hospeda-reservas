<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OwnerAccess extends Model
{
    protected $table = 'owner_access';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['user_id', 'full_name', 'stays_owner_id', 'status', 'approved_at', 'reviewed_by', 'reviewed_at'];

    protected function casts(): array
    {
        return ['approved_at' => 'immutable_datetime', 'reviewed_at' => 'immutable_datetime'];
    }
}
