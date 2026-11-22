"use client";
import "@/features/branding/theme.css";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useEffect,useState } from "react";
import { upgradeDevice } from "./devices";
import { validKeys } from "./subscription-keys";
import { unreadCount } from "./inbox";
export function NotificationBell() {
  const [unread,setUnread] = useState(0);
  useEffect(() => {
    let active=true;
    const refresh=async()=>{if(document.hidden)return;try{const count=await unreadCount();if(active)setUnread(count);}catch{/* Retry when the app regains focus. */}};
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/").then(async registration => {
        const subscription = await registration?.pushManager?.getSubscription();
        const keys = subscription?.toJSON().keys;
        if (active && subscription && validKeys(keys)) await upgradeDevice(subscription.endpoint, keys);
      }).catch(() => { /* Retry on the next signed-in visit. */ });
    }
    void refresh();
    const timer=setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    window.addEventListener("inbox-changed",refresh);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("inbox-changed",refresh);};
  },[]);
  return <Link href="/settings/notifications" aria-label={`Notifications, ${unread} unread`} className="button-secondary relative inline-flex items-center gap-1"><BellIcon size={18}/>{unread>0 && <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-white tabular-nums">{unread>99?"99+":unread}</span>}</Link>;
}
