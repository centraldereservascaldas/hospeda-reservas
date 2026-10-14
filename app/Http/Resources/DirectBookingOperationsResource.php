<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOperationsResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $order = $this->resource;
        $events = $this->operational_events ?? [];
        $lastEvent = is_array($events) && $events !== []
            ? $events[array_key_last($events)]
            : null;
        $manualCancellationReview = collect($events)->last(fn (mixed $event): bool => is_array($event)
            && ($event['event'] ?? null) === 'manual_cancellation_processing_started');

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
            'paymentApprovedWithoutConfirmedReservation' => $this->payment_status === 'approved'
                && ! in_array($this->status->value, ['confirmado', 'concluido'], true),
            'latePaymentAfterHold' => collect($events)->contains(fn (mixed $event): bool => is_array($event)
                && (($event['code'] ?? null) === 'payment_approved_after_hold'
                    || ($event['source'] ?? null) === 'late_or_unreserved_payment')),
            'staysActionFailed' => $order->relationLoaded('staysActions')
                && $order->staysActions->contains(fn ($action): bool => in_array($action->status, ['failed', 'attention_required'], true)),
            'staysCancellationConfirmed' => collect($events)->contains(fn (mixed $event): bool => is_array($event)
                && ($event['code'] ?? null) === 'stays_cancellation_verified'),
            'gatewayRefundConfirmed' => $this->payment_status === 'refunded',
            'manualCancellationReview' => is_array($manualCancellationReview) ? [
                'reason' => is_string($manualCancellationReview['reason'] ?? null) ? $manualCancellationReview['reason'] : null,
                'reviewedBy' => is_string($manualCancellationReview['reviewed_by'] ?? null) ? $manualCancellationReview['reviewed_by'] : null,
                'at' => is_string($manualCancellationReview['reviewed_at'] ?? null) ? $manualCancellationReview['reviewed_at'] : null,
            ] : null,
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
                        'action' => $action->action_type,
                        'status' => $action->status,
                        'code' => $action->error_code,
                        'message' => $action->error_message,
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
                        'action' => null,
                        'status' => $attempt->status,
                        'code' => $attempt->error_code,
                        'message' => null,
                        'updatedAt' => $attempt->updated_at,
                    ]);
                }

                if ($attempt->relationLoaded('webhooks')) {
                    foreach ($attempt->webhooks as $webhook) {
                        if (in_array($webhook->status, ['retrying', 'failed'], true)) {
                            $issues->push([
                                'source' => 'webhook',
                                'action' => null,
                                'status' => $webhook->status,
                                'code' => $webhook->error_code,
                                'message' => null,
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
                'action' => $issue['action'],
                'status' => $issue['status'],
                'code' => $issue['code'],
                'message' => $issue['message'],
            ];
        }

        if (is_array($lastEvent) && is_string($lastEvent['code'] ?? null)) {
            return [
                'source' => (string) ($lastEvent['source'] ?? $lastEvent['event'] ?? 'order'),
                'action' => null,
                'status' => (string) ($lastEvent['status'] ?? 'attention_required'),
                'code' => $lastEvent['code'],
                'message' => null,
            ];
        }

        return null;
    }
}
