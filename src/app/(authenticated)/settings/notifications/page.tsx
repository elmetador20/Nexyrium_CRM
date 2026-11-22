import {Inbox} from "@/features/notifications/NotificationCenter";
import {readInbox} from "@/features/notifications/inbox";
export const instant=false;
export default async function Page(){return <Inbox initial={await readInbox()}/>;}
