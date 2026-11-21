import {ConnectorError} from './provider-http.mjs';
export function parseReservationContext(html,{reference,from,to,baseCents}) {
 const matches=[...html.matchAll(/var\s+data\s*=\s*'({[^']*"formReserva-totalDinheiro"[^']*})'\s*;/g)];
 if(matches.length!==1)throw new ConnectorError('reservation_context_unrecognized','Contexto do parceiro indisponível.',409);
 let data;try{data=JSON.parse(matches[0][1]);}catch{throw new ConnectorError('reservation_context_unrecognized','Contexto do parceiro inválido.',409);}
 const get=k=>String(data[`formReserva-${k}`]??'');
 if(get('unidadeParceiro')!==reference||get('entrada')!==from||get('saida')!==to||!/^\d+(?:\.\d{1,2})?$/.test(get('totalDinheiro'))||Math.round(Number(get('totalDinheiro'))*100)!==baseCents||!/^[A-Za-z0-9]{1,12}$/.test(get('BaseConsulta')))throw new ConnectorError('reservation_context_mismatch','Dados da reserva divergentes.',409);
 return {idImovel:reference,entrada:from,saida:to,horaEntrada:get('horaEntrada'),horaSaida:get('horaSaida'),totalDinheiro:get('totalDinheiro'),totalCartao:get('totalCartao'),BaseConsulta:get('BaseConsulta'),entradaAntecipada:get('entradaAntecipada'),saidaProrrogada:get('saidaProrrogada'),roupasCama:get('roupasCama'),acessoLagoa:get('acessoLagoa'),refParceiro:get('refParceiro'),refFornecedor:get('refFornecedor')};
}
