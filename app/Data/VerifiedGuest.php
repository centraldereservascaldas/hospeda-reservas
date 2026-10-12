<?php

namespace App\Data;

class VerifiedGuest
{
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly string $fullName,
        public readonly array $user,
    ) {}
}
