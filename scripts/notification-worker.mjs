// Run alongside the Next.js server, or call the same POST endpoint from a scheduler.
import { setTimeout as wait } from "node:timers/promises";
const token = process.env.NOTIFICATION_JOB_SECRET;
const origin = process.env.NOTIFICATION_APP_ORIGIN;
if (!token || !origin) throw Error("Set NOTIFICATION_JOB_SECRET and NOTIFICATION_APP_ORIGIN first.");
const url = new URL("/api/internal/notification-delivery",origin);
if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw Error("Use HTTPS for the deployed CRM.");
do {
  try {
    const response = await fetch(url,{method:"POST",headers:{authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(45000)});
    if(!response.ok) throw Error("Worker endpoint returned HTTP "+response.status);
    console.log("Notification worker processed",(await response.json()).processed,"deliveries.");
  } catch(error) {
    console.error(error instanceof Error ? error.message : "Notification worker failed.");
    if(process.argv.includes("--once")) process.exitCode=1;
  }
  if(process.argv.includes("--once")) break;
  await wait(60000);
} while(true);
