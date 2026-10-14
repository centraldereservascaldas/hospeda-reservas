<x-mail::message>
# Reserva confirmada

Olá, {{ $order->guest_name }}.

Sua reserva foi confirmada após a aprovação do pagamento e a confirmação da hospedagem.

**Período:** {{ $order->check_in->format('d/m/Y') }} a {{ $order->check_out->format('d/m/Y') }}
**Hóspedes:** {{ array_sum($order->guests ?? []) }}
**Valor registrado:** {{ $order->currency }} {{ number_format((float) $order->quote_total, 2, ',', '.') }}

Nossa equipe acompanha a reserva e pode orientar você sobre os próximos passos para o check-in do condomínio.

Atenciosamente,
{{ config('app.name') }}
</x-mail::message>
