import {createECDH,createPublicKey,verify} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {checkedEndpoint,sendWakeup} from "@/features/notifications/push-transport";
import {notifyExpense} from "@/features/notifications/expense-events";
import type {AccountingTransaction} from "@/features/accounting/queries";
import type {expenses} from "@/db/schema";

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("private notification delivery",()=>{
  it.each(["https://localhost/push","https://fcm.googleapis.com.evil.example/x","http://fcm.googleapis.com/x","https://fcm.googleapis.com:444/x","https://u@push.apple.com/x"])("rejects endpoint %s",value=>expect(()=>checkedEndpoint(value)).toThrow());
  it("sends a signed payload-free wakeup without following redirects",async()=>{
    const ec=createECDH("prime256v1");const pub=ec.generateKeys();
    vi.stubEnv("PUSH_VAPID_PRIVATE_KEY",ec.getPrivateKey().toString("base64url"));
    vi.stubEnv("PUSH_CONTACT","mailto:example@example.com");
    const fetchMock=vi.fn(async (_url:URL, options:RequestInit)=>{
      const header=(options.headers as Record<string,string>).Authorization;
      const [head,claims,sig]=header.slice("vapid t=".length).split(",")[0].split(".");
      expect(JSON.parse(Buffer.from(claims,"base64url").toString()).aud).toBe("https://fcm.googleapis.com");
      const key=createPublicKey({format:"jwk",key:{kty:"EC",crv:"P-256",x:pub.subarray(1,33).toString("base64url"),y:pub.subarray(33).toString("base64url")}});
      expect(verify("sha256",Buffer.from(head+"."+claims),{key,dsaEncoding:"ieee-p1363"},Buffer.from(sig,"base64url"))).toBe(true);
      expect(options.redirect).toBe("error");expect(options.body).toBeUndefined();
      return new Response(null,{status:201});
    });
    vi.stubGlobal("fetch",fetchMock);
    expect(await sendWakeup("https://fcm.googleapis.com/test")).toBe(201);
  });
  it.each(["submitted","approved","rejected"])("records %s per authorized recipient with retry protection",async status=>{
    const values=vi.fn(()=>({onConflictDoNothing:vi.fn()}));
    const tx={execute:vi.fn(async()=>({rows:[{id:"recipient"}]})),insert:()=>({values})} as unknown as AccountingTransaction;
    await notifyExpense(tx,{id:"record",status} as typeof expenses.$inferSelect,"actor");
    expect(values).toHaveBeenCalledWith([expect.objectContaining({type:"expense."+status,recipientUserId:"recipient",dedupeKey:"expense:record:"+status+":recipient"})]);
  });
});
