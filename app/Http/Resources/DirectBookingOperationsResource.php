<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOperationsResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $events = $this->operational_events ?? [];
        $lastEvent = is_array($events) && $events !== []
            ? $events[array_key_last($events)]
            : null;

        return [
            'id' => $this->id,
            'publicReference' => $this->public_reference,
            'status' => $this->status->value,
            'listingId' => $this->listing_id,
            'from' => $this->check_in->toDateString(),
            'to' => $this->check_out->toDateString(),
            'guestName' => $this->guest_name,
            'guestEmail' => $this->guest_email,
            'quoteTotal' => $this->quote_total,
            'currency' => $this->currency,
            'paymentStatus' => $this->payment_status,
            'paymentMethod' => $this->payment_method,
            'gatewayPaymentId' => $this->gateway_payment_id,
            'staysReservationId' => $this->stays_reservation_id,
            'updatedAt' => $this->updated_at?->toISOString(),
            'lastEvent' => is_array($lastEvent) ? array_intersect_key($lastEvent, array_flip(['event', 'status', 'source', 'code', 'at'])) : null,
            'issue' => $this->resolveIssue($lastEvent),
        ];
    }

    /** @param array<string, mixed>|null $lastEvent
     * @return array{source: string, status: string, code: string|null}|null
     */
    private function resolveIssue(?array $lastEvent): ?array
    {
        $issues = collect();
        $order = $this->resource;

        if ($order->relationLoaded('staysActions')) {
            foreach ($order->staysActions as $action) {
                if (in_array($action->status, ['failed', 'attention_required'], true)) {
                    $issues->push([
                        'source' => 'stays',
                        'status' => $action->status,
                        'code' => $action->error_code,
                        'updatedAt' => $action->updated_at,
                    ]);
                }
            }
        }

        if ($order->relationLoaded('paymentAttempts')) {
            foreach ($order->paymentAttempts as $attempt) {
                if (in_array($attempt->status, ['failed', 'unknown', 'attention_required'], true)) {
                    $issues->push([
                        'source' => 'payment',
                        'status' => $attempt->status,
                        'code' => $attempt->error_code,
                        'updatedAt' => $attempt->updated_at,
                    ]);
                }

                if ($attempt->relationLoaded('webhooks')) {
                    foreach ($attempt->webhooks as $webhook) {
                        if (in_array($webhook->status, ['retrying', 'failed'], true)) {
                            $issues->push([
                                'source' => 'webhook',
                                'status' => $webhook->status,
                                'code' => $webhook->error_code,
                                'updatedAt' => $webhook->updated_at,
                            ]);
                        }
                    }
                }
            }
        }

        if ($issues->isNotEmpty()) {
            $issue = $issues->sortByDesc('updatedAt')->first();

            return [
                'source' => $issue['source'],
                'status' => $issue['status'],
                'code' => $issue['code'],
            ];
        }

        if (is_array($lastEvent) && is_string($lastEvent['code'] ?? null)) {
            return [
                'source' => (string) ($lastEvent['source'] ?? $lastEvent['event'] ?? 'order'),
                'status' => (string) ($lastEvent['status'] ?? 'attention_required'),
                'code' => $lastEvent['code'],
            ];
        }

        return null;
    }
}
