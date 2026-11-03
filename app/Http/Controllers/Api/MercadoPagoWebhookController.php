<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\MercadoPagoWebhookSignature;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MercadoPagoWebhookController extends Controller
{
    public function __invoke(Request $request, MercadoPagoWebhookSignature $signature): JsonResponse
    {
        $query = $request->query->all();
        $paymentId = $request->query('data.id')
            ?? $request->query('data_id')
            ?? data_get($query, 'data.id');
        $requestId = $request->header('x-request-id');
        $type = $request->query('type', $request->input('type'));

        if ($type !== 'payment' || (! is_string($paymentId) && ! is_int($paymentId)) || trim((string) $paymentId) === '') {
            Log::warning('checkout.webhook.rejected', [
                'event' => 'checkout.webhook.rejected',
                'gateway' => 'mercadopago',
                'reason' => 'invalid_notification',
            ]);

            return response()->json(['success' => false, 'code' => 'invalid_notification'], 400);
        }

        if (! $signature->isValid($request->header('x-signature'), $requestId, $paymentId)) {
            Log::warning('checkout.webhook.rejected', [
                'event' => 'checkout.webhook.rejected',
                'gateway' => 'mercadopago',
                'reason' => 'invalid_signature',
            ]);

            return response()->json(['success' => false, 'code' => 'invalid_signature'], 401);
        }

        $queueConnection = (string) config('services.mercadopago.webhook_queue_connection', 'database');
        if ($queueConnection === 'sync' || ! config("queue.connections.{$queueConnection}")) {
            Log::error('checkout.webhook.queue_unavailable', [
                'event' => 'checkout.webhook.queue_unavailable',
                'gateway' => 'mercadopago',
                'reason' => 'webhook_queue_unavailable',
            ]);

            return response()->json(['success' => false, 'code' => 'webhook_queue_unavailable'], 503);
        }

        $action = $request->input('action');
        $eventKey = hash('sha256', implode('|', [(string) $requestId, (string) $paymentId, is_string($action) ? $action : '']));
        try {
            $webhook = DB::transaction(function () use ($eventKey, $paymentId, $requestId, $queueConnection): DirectBookingPaymentWebhook {
                $webhook = DirectBookingPaymentWebhook::query()->create([
                    'event_key' => $eventKey,
                    'gateway_provider' => 'mercadopago',
                    'gateway_payment_id' => (string) $paymentId,
                    'request_id' => is_string($requestId) ? Str::limit($requestId, 150, '') : null,
                    'status' => 'received',
                    'received_at' => now(),
                ]);

                ReconcileMercadoPagoPayment::dispatch($webhook->id)
                    ->onConnection($queueConnection)
                    ->afterCommit();

                return $webhook;
            });
        } catch (UniqueConstraintViolationException) {
            $shouldRequeue = DB::transaction(function () use ($eventKey): bool {
                $existingWebhook = DirectBookingPaymentWebhook::query()
                    ->where('event_key', $eventKey)
                    ->lockForUpdate()
                    ->first();
                if ($existingWebhook === null
                    || in_array($existingWebhook->status, ['processed', 'received', 'processing', 'retrying', 'queued'], true)
                    || ($existingWebhook->status === 'failed'
                        && $existingWebhook->reconciliation_attempts >= ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS)) {
                    return false;
                }

                $existingWebhook->forceFill(['status' => 'received', 'error_code' => null])->save();

                return true;
            });
            if (! $shouldRequeue) {
                Log::info('checkout.webhook.duplicate', [
                    'event' => 'checkout.webhook.duplicate',
                    'gateway' => 'mercadopago',
                    'reason' => 'already_received_or_processed',
                ]);

                return response()->json(['success' => true, 'duplicate' => true], 200);
            }

            $existingWebhookId = DirectBookingPaymentWebhook::query()->where('event_key', $eventKey)->value('id');
            if (! is_string($existingWebhookId)) {
                return response()->json(['success' => true, 'duplicate' => true], 200);
            }
            ReconcileMercadoPagoPayment::dispatch($existingWebhookId)->onConnection($queueConnection);

            Log::info('checkout.webhook.requeued', [
                'event' => 'checkout.webhook.requeued',
                'correlation_id' => $existingWebhookId,
                'webhook_id' => $existingWebhookId,
                'gateway' => 'mercadopago',
            ]);

            return response()->json(['success' => true, 'requeued' => true], 202);
        }

        Log::info('checkout.webhook.queued', [
            'event' => 'checkout.webhook.queued',
            'correlation_id' => $webhook->id,
            'webhook_id' => $webhook->id,
            'gateway' => 'mercadopago',
        ]);

        return response()->json(['success' => true, 'received' => true], 202);
    }
}
