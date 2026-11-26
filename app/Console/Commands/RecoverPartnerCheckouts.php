<?php

namespace App\Console\Commands;

use App\Jobs\CompletePartnerCheckout;
use App\Models\PartnerCheckoutOrder;
use Illuminate\Console\Command;

class RecoverPartnerCheckouts extends Command
{
    protected $signature = 'partner-checkout:recover-sandbox {--limit=50}';

    protected $description = 'Enfileira pedidos pendentes ou pagos do checkout parceiro em sandbox.';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled')) {
            $this->error('Disponível apenas em ambiente local ou de testes com Cielo sandbox.');

            return self::FAILURE;
        }
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT);
        if (! is_int($limit) || $limit < 1 || $limit > 100) {
            $this->error('Limite deve estar entre 1 e 100.');

            return self::FAILURE;
        }

        // A worker can terminate after claiming an order and before persisting the
        // external response. Never repeat either mutation on that uncertainty.
        $staleBefore = now()->subMinutes(10);
        PartnerCheckoutOrder::query()->where('status', 'payment_starting')->where('updated_at', '<', $staleBefore)
            ->update(['status' => 'attention_required', 'attention_reason' => 'payment_outcome_unknown']);
        PartnerCheckoutOrder::query()->where('status', 'reservation_starting')->where('updated_at', '<', $staleBefore)
            ->update(['status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown']);

        $count = 0;
        PartnerCheckoutOrder::query()->where(function ($query): void {
            $query->whereIn('status', ['payment_pending', 'payment_verified'])
                ->orWhere(function ($query): void {
                    $query->where('status', 'attention_required')->where('attention_reason', 'payment_outcome_unknown');
                });
        })->orderByRaw('CASE WHEN recovery_requested_at IS NULL THEN 0 ELSE 1 END')
            ->orderBy('recovery_requested_at')->orderBy('id')->limit($limit)->get(['id'])->each(function (PartnerCheckoutOrder $order) use (&$count): void {
            CompletePartnerCheckout::dispatch($order->id)->afterCommit();
            PartnerCheckoutOrder::query()->whereKey($order->id)->update(['recovery_requested_at' => now()]);
            $count++;
        });
        $this->info("Pedidos enfileirados: {$count}");

        return self::SUCCESS;
    }
}
