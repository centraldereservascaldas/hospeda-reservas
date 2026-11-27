<?php

namespace Tests;

use App\Http\Middleware\RequireExistingReservationOwner;
use App\Http\Middleware\VerifySupabaseGuest;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function useLegacyExistingReservationFixtures(): void
    {
        $this->withoutMiddleware(RequireExistingReservationOwner::class);
        $this->withoutMiddleware(VerifySupabaseGuest::class);
        $this->withToken('valid-access-token');
    }
}
