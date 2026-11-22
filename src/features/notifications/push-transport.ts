import {createECDH,createPrivateKey,sign} from "node:crypto";

export function checkedEndpoint(value:string) {
  const url = new URL(value);
  const providers = ["fcm.googleapis.com","updates.push.services.mozilla.com","push.services.mozilla.com","push.apple.com","notify.windows.com"];
  const allowed=providers.some(host => url.hostname === host || (host !== "fcm.googleapis.com" && url.hostname.endsWith("."+host)));
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash || value.length>2048) throw Error("Unsupported push service.");
  return url;
}
export function pushConfiguration() {
  const secret=process.env.PUSH_VAPID_PRIVATE_KEY;
  const contact=process.env.PUSH_CONTACT;
  if(!secret || !contact || !/^(mailto:|https:\/\/)/.test(contact)) throw Error("Phone notifications need server configuration.");
  const ec=createECDH("prime256v1");
  ec.setPrivateKey(Buffer.from(secret,"base64url"));
  const pub=ec.getPublicKey();
  return {contact,publicKey:pub.toString("base64url"),privateKey:createPrivateKey({format:"jwk",key:{kty:"EC",crv:"P-256",d:secret,x:pub.subarray(1,33).toString("base64url"),y:pub.subarray(33).toString("base64url")}})};
}
import type { SubscriptionKeys } from "./subscription-keys";
export async function sendWakeup(endpoint:string, notificationId?:string, content?: { keys: SubscriptionKeys; payload: string }) {
  const url=checkedEndpoint(endpoint);
  const {contact,publicKey,privateKey}=pushConfiguration();
  const encode=(data:object)=>Buffer.from(JSON.stringify(data)).toString("base64url");
  const claims=encode({typ:"JWT",alg:"ES256"})+"."+encode({aud:url.origin,sub:contact,exp:Math.floor(Date.now()/1000)+3600});
  const jwt=claims+"."+sign("sha256",Buffer.from(claims),{key:privateKey,dsaEncoding:"ieee-p1363"}).toString("base64url");
  const encrypted = content ? (await import("web-push")).default.encrypt(content.keys.p256dh, content.keys.auth, Buffer.from(content.payload), "aes128gcm").cipherText : undefined;
  const response=await fetch(url,{method:"POST",headers:{Authorization:"vapid t="+jwt+", k="+publicKey,TTL:"3600",...(notificationId ? {Topic:notificationId.replaceAll("-","")} : {}),...(encrypted ? {"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream"} : {}),"Content-Length":String(encrypted?.length ?? 0)},body:encrypted ? new Uint8Array(encrypted) : undefined,redirect:"error",signal:AbortSignal.timeout(5000)});
  await response.body?.cancel();
  return response.status;
}
