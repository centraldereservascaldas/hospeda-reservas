<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AffiliateAccount extends Model
{
    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['user_id', 'full_name', 'nickname', 'status'];
}
