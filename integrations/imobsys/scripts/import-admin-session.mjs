import {readFile} from 'node:fs/promises';
let envelope='';for await(const chunk of process.stdin){envelope+=chunk;if(envelope.length>24000)throw new Error('Envelope excessivo');}
const control=JSON.parse(await readFile(new URL('../data/admin-control.json',import.meta.url)));
const response=await fetch(`http://127.0.0.1:${control.port}/internal/admin-session`,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Control':control.controlKey},body:envelope});
const result=await response.json();
console.log(JSON.stringify({status:response.status,success:result.success,session:result.session,code:result.code}));
if(!response.ok)process.exitCode=1;
