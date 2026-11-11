<?php

namespace App\Console\Commands;

use App\Services\ExperimentalLegacyReservationEvidence;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use Throwable;

#[Signature('checkout:capture-legacy-evidence {order : Internal order UUID} {--apply : Persist verified evidence}')]
#[Description('Check one legacy order; use --apply to capture evidence')]
class CaptureLegacyReservationEvidence extends Command
{
    public function handle(ExperimentalLegacyReservationEvidence $evidence): int
    {
        $orderId = $this->argument('order');
        if (! is_string($orderId) || ! Str::isUuid($orderId) || config('services.stays.experimental_legacy_order_evidence') !== false) {
            $this->line('Invalid request or experimental evidence consumption is not disabled.');

            return self::FAILURE;
        }

        try {
            $apply = (bool) $this->option('apply');
            $success = $apply ? $evidence->capture($orderId) : $evidence->preview($orderId);
        } catch (Throwable) {
            $this->line('Evidence check failed.');

            return self::FAILURE;
        }

        if (! $success) {
            $this->line('Evidence check inconclusive or rejected.');

            return self::FAILURE;
        }

        $this->line($apply ? 'Evidence captured or already matches.' : 'Preliminary identity check passed; --apply repeats verification and may still fail.');

        return self::SUCCESS;
    }
}
