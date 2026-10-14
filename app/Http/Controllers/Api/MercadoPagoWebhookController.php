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
            return response()->json(['success' => false, 'code' => 'invalid_notification'], 400);
        }

        if (! $signature->isValid($request->header('x-signature'), $requestId, $paymentId)) {
            return response()->json(['success' => false, 'code' => 'invalid_signature'], 401);
        }

        $queueConnection = (string) config('services.mercadopago.webhook_queue_connection', 'database');
        if ($queueConnection === 'sync' || ! config("queue.connections.{$queueConnection}")) {
            return response()->json(['success' => false, 'code' => 'webhook_queue_unavailable'], 503);
        }

        $action = $request->input('action');
        $eventKey = hash('sha256', implode('|', [(string) $requestId, (string) $paymentId, is_string($action) ? $action : '']));
        try {
            $webhook = DB::transaction(function () use ($eventKey, $paymentId, $requestId, $queueConnection): DirectBookingPaymentWebhook {
                $webhook = DirectBookingPaymentWebhook::query()->create([
                    'event_key' => $eventKey,
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
            $existingWebhook = DirectBookingPaymentWebhook::query()->where('event_key', $eventKey)->first();
            if ($existingWebhook === null || in_array($existingWebhook->status, ['processed', 'received', 'processing', 'retrying'], true)) {
                return response()->json(['success' => true, 'duplicate' => true], 200);
            }

            $existingWebhook->forceFill(['status' => 'received', 'error_code' => null])->save();
            ReconcileMercadoPagoPayment::dispatch($existingWebhook->id)->onConnection($queueConnection);

            return response()->json(['success' => true, 'requeued' => true], 202);
        }

        return response()->json(['success' => true, 'received' => true], 202);
    }
}
