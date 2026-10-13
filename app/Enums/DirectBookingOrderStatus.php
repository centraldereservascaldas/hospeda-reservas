<?php

namespace App\Enums;

enum DirectBookingOrderStatus: string
{
    case Iniciado = 'iniciado';
    case Cotado = 'cotado';
    case PreReservado = 'pre_reservado';
    case LiberacaoPendente = 'liberacao_pendente';
    case PagamentoPendente = 'pagamento_pendente';
    case PagoEmConfirmacao = 'pago_em_confirmacao';
    case Confirmado = 'confirmado';
    case Concluido = 'concluido';
    case Expirado = 'expirado';
    case PagamentoRecusado = 'pagamento_recusado';
    case AtencaoOperacional = 'atencao_operacional';
    case CancelamentoSolicitado = 'cancelamento_solicitado';
    case ReembolsoPendente = 'reembolso_pendente';
    case Reembolsado = 'reembolsado';
    case Contestado = 'contestado';
}
