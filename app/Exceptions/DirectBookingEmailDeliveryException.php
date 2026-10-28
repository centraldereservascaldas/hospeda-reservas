<?php

namespace App\Exceptions;

use RuntimeException;

class DirectBookingEmailDeliveryException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Direct booking confirmation email delivery failed.');
    }
}
