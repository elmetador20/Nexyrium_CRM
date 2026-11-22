import {createECDH, randomBytes, randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {afterEach, expect, it, vi} from "vitest";
import {sendWakeup} from "@/features/notifications/push-transport";
import {pushMessage} from "@/features/notifications/push-message";

const requireFromTest = createRequire(import.meta.url);
const ece = createRequire(requireFromTest.resolve("web-push"))("http_ece");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(["expense.submitted", "expense.approved", "expense.rejected", "task.assigned", "task.due",
  "lead.follow_up", "quotation.submitted", "project.member.added", "invoice.overdue"])(
  "encrypts and displays the approved template for %s", async type => {
    const vapid = createECDH("prime256v1");
    vapid.generateKeys();
    vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", vapid.getPrivateKey().toString("base64url"));
    vi.stubEnv("PUSH_CONTACT", "mailto:test@example.org");
    const device = createECDH("prime256v1");
    const auth = randomBytes(16);
    const keys = {p256dh:device.generateKeys().toString("base64url"), auth:auth.toString("base64url")};
    const id = randomUUID();
    const expected = {id, ...pushMessage(type), href:"/settings/notifications"};
    const showNotification = vi.fn();
    const listeners = new Map();
    runInNewContext(readFileSync("public/nexyrium-push.js", "utf8"), {self:{
      addEventListener:listeners.set.bind(listeners), registration:{showNotification}
    }});
    vi.stubGlobal("fetch", async (_url:URL, init:RequestInit) => {
      expect(new Headers(init.headers).get("content-encoding")).toBe("aes128gcm");
      const bytes = Buffer.from(init.body as Uint8Array);
      const plain = ece.decrypt(bytes, {version:"aes128gcm", privateKey:device, authSecret:auth});
      expect(JSON.parse(plain.toString())).toEqual(expected);
      listeners.get("push")({waitUntil:vi.fn(), data:{json:()=>JSON.parse(plain.toString())}});
      return new Response(null,{status:201});
    });
    expect(await sendWakeup("https://fcm.googleapis.com/test",id,{keys,payload:JSON.stringify(expected)})).toBe(201);
    expect(showNotification).toHaveBeenCalledWith(expected.title,expect.objectContaining({body:expected.body,tag:id}));
  });
