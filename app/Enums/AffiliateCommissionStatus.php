<?php

namespace App\Enums;

enum AffiliateCommissionStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Paid = 'paid';
}
