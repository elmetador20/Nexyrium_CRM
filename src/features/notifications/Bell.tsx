"use client";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useEffect,useState } from "react";
import { unreadCount } from "./inbox";
export function NotificationBell() {
  const [unread,setUnread] = useState(0);
  useEffect(() => {
    let active=true;
    const refresh=async()=>{if(document.hidden)return;try{const count=await unreadCount();if(active)setUnread(count);}catch{/* Retry when the app regains focus. */}};
    void refresh();
    const timer=setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    window.addEventListener("inbox-changed",refresh);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("inbox-changed",refresh);};
  },[]);
  return <Link href="/settings/notifications" aria-label={`Notifications, ${unread} unread`} className="button-secondary relative inline-flex items-center gap-1"><BellIcon size={18}/>{unread>0 && <span>{unread>99?"99+":unread}</span>}</Link>;
}
