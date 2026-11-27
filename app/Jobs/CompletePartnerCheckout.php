<?php

namespace App\Jobs;

use App\Services\PartnerCheckoutCompletionService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class CompletePartnerCheckout implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 180;

    public int $uniqueFor = 240;

    public function __construct(public readonly string $orderId)
    {
        $this->onConnection('partner_sandbox')->onQueue('partner-sandbox');
    }

    public function handle(PartnerCheckoutCompletionService $checkout): void
    {
        $checkout->complete($this->orderId);
    }

    public function uniqueId(): string
    {
        return $this->orderId;
    }
}
