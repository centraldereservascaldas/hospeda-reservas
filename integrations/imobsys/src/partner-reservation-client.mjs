import { ConnectorError } from './provider-http.mjs';

/** Explicitly gated mutation using the operation observed in the supplier's own form. */
export function createPartnerReservationClient({enabled=false,fetchImpl=fetch}={}) {
  return {
    async create({fields,customer}) {
      if(enabled!==true)throw new ConnectorError('reservation_creation_disabled','Criação de pré-reservas desativada.',503);
      const required=['idImovel','entrada','saida','horaEntrada','horaSaida','totalCartao','totalDinheiro','BaseConsulta'];
      if(!fields||required.some(key=>typeof fields[key]!=='string'||!fields[key]||fields[key].length>100||/[<>\r\n]/.test(fields[key]))||!/^\d+$/.test(fields.idImovel)||!/^[A-Za-z0-9]{1,12}$/.test(fields.BaseConsulta))throw new ConnectorError('invalid_reservation_context','Contexto do formulário incompleto.',409);
      if(!customer||typeof customer.name!=='string'||!customer.name.trim()||!/^\d{11}$/.test(customer.cpf||'')||!/^\d{10,13}$/.test(customer.phone||''))throw new ConnectorError('invalid_customer','Dados do titular incompletos.',422);
      const body=new URLSearchParams({Ajax:'Ajax',Controller:'reservaOnline',Action:'reservarImovelParceiro'});
      const allowed=[...required,'entradaAntecipada','saidaProrrogada','roupasCama','acessoLagoa','idCliente','atendimento','ID_ORCA','usuario','refParceiro','refFornecedor'];
      for(const key of allowed)if(typeof fields[key]==='string')body.set(key,fields[key]);
      body.set('nome',customer.name.trim());body.set('cpf',customer.cpf);body.set('whatsapp',customer.phone);
      // Deliberately never retry a mutation: an interrupted result needs reconciliation.
      let response;
      try{response=await fetchImpl('https://reservascrcn.com.br/',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});}catch{throw new ConnectorError('reservation_result_unknown','Resultado da pré-reserva precisa de conferência; não repetir.',503);}
      if(response.status!==200)throw new ConnectorError('reservation_result_unknown','Resposta da pré-reserva precisa de conferência; não repetir.',503);
      const html=await response.text();
      const references=[...html.matchAll(/(?:https:\/\/reservascrcn\.com\.br)?\/contrato\/([1-9]\d*)\/0\b/g)].map(match=>match[1]);
      const unique=[...new Set(references)];
      if(unique.length!==1)throw new ConnectorError('reservation_result_unknown','A resposta não identificou uma pré-reserva única; não repetir.',503);
      return {reference:unique[0],contractUrl:`https://reservascrcn.com.br/contrato/${unique[0]}/0`,requiresVerification:true};
    },
  };
}
