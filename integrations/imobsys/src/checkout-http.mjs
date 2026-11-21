/** Internal endpoint adapter. Authorization is required before reading any body. */
export async function handleCheckoutHttp({req,res,url,authorize,flow,operations,reconcile,sellerStore}) {
 if(!url.pathname.startsWith('/internal/checkout/'))return false;
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(!authorize(req)){send(403,{success:false,code:'control_denied'});return true;}
 try {
  const match=url.pathname.match(/^\/internal\/checkout\/([A-Za-z0-9]{1,25})$/);
  if(req.method==='GET'&&match){const item=operations.get(match[1]);send(item?200:404,item?{success:true,environment:'sandbox',order:item}:{success:false,code:'not_found'});return true;}
  if(req.method!=='POST'){send(405,{success:false,code:'method_not_allowed'});return true;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000){send(413,{success:false,code:'body_too_large'});return true;}}
  let input;try{input=JSON.parse(raw);}catch{send(400,{success:false,code:'invalid_json'});return true;}
  if(url.pathname==='/internal/checkout/start'){send(201,{success:true,...await flow.start(input)});return true;}
  if(url.pathname==='/internal/checkout/reconcile'){const item=operations.get(input.id);if(!item?.payload?.order||!item.payload.paymentId){send(409,{success:false,code:'payment_not_ready'});return true;}await reconcile(item);send(200,{success:true,status:'awaiting_seller_confirmation'});return true;}
  if(url.pathname==='/internal/checkout/seller-confirm'){sellerStore.confirm(input.id,input.operator);send(200,{success:true,status:'confirmed',environment:'sandbox'});return true;}
  send(404,{success:false,code:'not_found'});
 }catch{send(409,{success:false,code:'checkout_requires_review'});}
 return true;
}
