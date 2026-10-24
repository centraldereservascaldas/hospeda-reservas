<?php

namespace App\Mail;

use App\Models\DirectBookingOrder;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DirectBookingConfirmed extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly DirectBookingOrder $order,
        public readonly ?string $reservationCode = null,
    ) {}

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Sua reserva foi confirmada',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            markdown: 'emails.direct-booking-confirmed',
            with: [
                'order' => $this->order,
                'reservationCode' => $this->reservationCode,
            ],
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
