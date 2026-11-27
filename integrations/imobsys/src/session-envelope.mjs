import { generateKeyPairSync, privateDecrypt, constants, createDecipheriv, randomBytes } from 'node:crypto';
import { ConnectorError } from './provider-http.mjs';
export function createSessionReceiver() {
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const controlKey=randomBytes(32).toString('hex');
  return {
    controlKey,
    publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),
    decode(envelope) {
      try {
        if(envelope?.version!==1)throw new Error();
        for(const key of ['wrappedKey','iv','ciphertext'])if(typeof envelope[key]!=='string'||envelope[key].length>16000||!/^[A-Za-z0-9+/]+=*$/.test(envelope[key]))throw new Error();
        const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
        const iv=Buffer.from(envelope.iv,'base64'),payload=Buffer.from(envelope.ciphertext,'base64');
        if(key.length!==32||iv.length!==12||payload.length<17)throw new Error();
        const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(payload.subarray(-16));
        return JSON.parse(Buffer.concat([cipher.update(payload.subarray(0,-16)),cipher.final()]).toString('utf8'));
      } catch {throw new ConnectorError('invalid_session_envelope','Envelope de sessão inválido.',400);}
    },
  };
}
