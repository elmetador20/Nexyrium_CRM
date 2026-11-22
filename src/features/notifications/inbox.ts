"use server";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications as n } from "@/db/schema";
import { requireActor } from "@/lib/authorization/server";

const destinations: Record<string,string> = { expense:"/expenses/", project:"/projects/", lead:"/crm/leads/", deal:"/crm/deals/", invoice:"/finance/invoices/", quotation:"/quotations/" };

export async function readInbox(before?: { date: string; id: string }) {
  const {userId} = await requireActor();
  const cursor = before && z.object({date:z.string().datetime(),id:z.string().uuid()}).parse(before);
  const mine = eq(n.recipientUserId,userId);

  const [rows,[total]] = await Promise.all([
    db.select().from(n).where(and(mine, cursor ? sql`(${n.createdAt},${n.id}) < (select created_at,id from notifications where id=${cursor.id}::uuid and recipient_user_id=${userId}::uuid)` : undefined)).orderBy(desc(n.createdAt),desc(n.id)).limit(31),
    db.select({value:count()}).from(n).where(and(mine,isNull(n.readAt))),
  ]);
  const items = rows.slice(0,30).map(row => ({id:row.id, title:row.title, body:row.body, read:!!row.readAt,
    date:row.createdAt.toISOString(), href:row.type === "project.member.removed" ? null :
      row.resourceId && row.resourceType && destinations[row.resourceType] ? destinations[row.resourceType]+row.resourceId :
      row.resourceType === "target" ? "/targets" : row.resourceType === "team" ? "/people" : row.resourceType === "document" ? "/documents" : row.resourceType === "task" ? "/tasks" : row.resourceType === "payment" ? "/finance/payments" : null}));
  return { items, unread:total.value, more:rows.length>30 };
}

export async function markRead(id?: string) {
  const {userId} = await requireActor();
  await db.update(n).set({readAt:new Date()}).where(and(eq(n.recipientUserId,userId),isNull(n.readAt),id === undefined ? undefined : eq(n.id,z.string().uuid().parse(id))));
}

export async function unreadCount() {
  const {userId} = await requireActor();
  const [row] = await db.select({value:count()}).from(n).where(and(eq(n.recipientUserId,userId),isNull(n.readAt)));
  return row.value;
}
