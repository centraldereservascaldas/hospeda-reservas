export function allowBrowserRequest({url,method,body=''}) {
 const target=new URL(url);
 if(target.origin!=='https://app.reservascrcn.com.br')return false;
 if(method==='POST'){
  if(target.pathname==='/login')return true;
  if(target.pathname!=='/Ajax.php')return false;
  const params=new URLSearchParams(body);
  if(params.getAll('Controller').length!==1||params.getAll('Action').length!==1)return false;
  return params.get('Controller')==='hospedagem'&&['getOrcamentoRede','newSugestao_saida'].includes(params.get('Action'));
 }
 if(method!=='GET')return false;
 return ['/','/login','/inicio/manutencao','/hospedagem/orcamentoRede','/favicon.ico'].includes(target.pathname)||/^\/(?:template|fotos|images)\//.test(target.pathname);
}
