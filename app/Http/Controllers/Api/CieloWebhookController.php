<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ReconcileCieloPaymentWebhook;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\CieloDirectConfiguration;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CieloWebhookController extends Controller
{
    public function __invoke(Request $request, CieloDirectConfiguration $configuration): JsonResponse
    {
        if ($configuration->environment() !== 'sandbox' && ! $configuration->isAllowed()) {
            return response()->json(['success' => false, 'code' => 'cielo_environment_disabled'], 503);
        }
        $headerName = $configuration->value('webhook_header_name');
        $headerValue = $configuration->value('webhook_header_value');
        $headerConfigured = is_string($headerName) && trim($headerName) !== ''
            && is_string($headerValue) && trim($headerValue) !== '';
        $headerConfigurationInvalid = ($headerName !== null || $headerValue !== null) && ! $headerConfigured;
        if ($headerConfigurationInvalid || ($headerConfigured
            && ! hash_equals($headerValue, (string) $request->header($headerName, '')))) {
            return response()->json(['success' => false, 'code' => 'invalid_notification'], 401);
        }

        $paymentId = $request->input('PaymentId');
        $changeType = filter_var($request->input('ChangeType'), FILTER_VALIDATE_INT);
        if (! is_string($paymentId)
            || ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $paymentId)
            || ! in_array($changeType, [1, 5, 25], true)) {
            return response()->json(['success' => false, 'code' => 'invalid_notification'], 400);
        }

        $queueConnection = (string) ($configuration->value('webhook_queue_connection') ?? 'database');
        if ($queueConnection === 'sync' || ! config("queue.connections.{$queueConnection}")) {
            return response()->json(['success' => false, 'code' => 'webhook_queue_unavailable'], 503);
        }

        $eventKey = hash('sha256', implode('|', [
            $configuration->provider(),
            $paymentId,
            (string) $changeType,
            (string) intdiv(now()->timestamp, 300),
        ]));

        try {
            $webhook = DB::transaction(function () use ($eventKey, $paymentId, $request, $queueConnection, $configuration): DirectBookingPaymentWebhook {
                $webhook = DirectBookingPaymentWebhook::query()->create([
                    'event_key' => $eventKey,
                    'gateway_provider' => $configuration->provider(),
                    'gateway_payment_id' => $paymentId,
                    'request_id' => $request->header('x-request-id') === null
                        ? null
                        : Str::limit((string) $request->header('x-request-id'), 150, ''),
                    'status' => 'received',
                    'received_at' => now(),
                ]);

                ReconcileCieloPaymentWebhook::dispatch($webhook->id)
                    ->onConnection($queueConnection)
                    ->afterCommit();

                return $webhook;
            });
        } catch (UniqueConstraintViolationException) {
            return response()->json(['success' => true, 'duplicate' => true], 200);
        }

        return response()->json(['success' => true, 'queued' => true, 'id' => $webhook->id], 202);
    }
}
