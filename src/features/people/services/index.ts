import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, departments, invitations, peopleProfiles, userDepartments, users } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { PeopleError } from "../errors";
import { peopleScope } from "../scope";
import { peopleListSchema, peopleUpdateSchema } from "../schemas";
import { findUser, getPerson, listPeople } from "../queries";

export function createPeopleService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.PEOPLE_READ)) throw new PeopleError("FORBIDDEN", "You cannot read people profiles.");
      return listPeople(peopleListSchema.parse(rawInput), peopleScope(actor));
    },

    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.PEOPLE_READ)) throw new PeopleError("FORBIDDEN", "You cannot read people profiles.");
      const person = await getPerson(id, peopleScope(actor));
      if (!person) throw new PeopleError("NOT_FOUND", "People profile not found.");
      return person;
    },

    async update(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.PEOPLE_MANAGE)) throw new PeopleError("FORBIDDEN", "You cannot manage people profiles.");
      const input = peopleUpdateSchema.parse(rawInput);
      const current = await getPerson(id, peopleScope(actor));
      if (!current) throw new PeopleError("NOT_FOUND", "People profile not found.");
      const terminate = input.employmentStatus === "terminated";
      if (terminate && (id === actor.userId || !can(actor, PERMISSIONS.AUTH_ROLE_MANAGE))) {
        throw new PeopleError("FORBIDDEN", "An account administrator must remove another teammate.");
      }
      if (terminate && current.roles.some(role => ["owner_admin", "founder"].includes(role.slug)) && !actor.roles.includes("owner_admin")) {
        throw new PeopleError("FORBIDDEN", "Only an Owner/Admin can remove another founder or administrator.");
      }
      if (input.managerUserId === id) throw new PeopleError("CONFLICT", "A person cannot report to themselves.");
      if (input.managerUserId) {
        const manager = await findUser(input.managerUserId);
        if (!manager || !manager.isActive) throw new PeopleError("NOT_FOUND", "The selected manager is not an active user.");
      }
      if (input.departmentIds) {
        const selectedDepartments = await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, input.departmentIds));
        if (selectedDepartments.length !== input.departmentIds.length) throw new PeopleError("NOT_FOUND", "One or more selected departments do not exist.");
      }
      await db.transaction(async (tx) => {
        if (terminate) {
          // Lock pending invitations before the user, in the same order as invitation acceptance.
          await tx.update(invitations).set({ revokedAt: new Date() }).where(and(
            sql`lower(${invitations.email}) = ${current.email.toLowerCase()}`, isNull(invitations.acceptedAt), isNull(invitations.revokedAt)
          ));
        }
        const [account] = await tx.select({ active: users.isActive }).from(users).where(eq(users.id, id)).for("update");
        if (!account?.active) throw new PeopleError("CONFLICT", "This account is inactive.");
        if (input.name !== undefined) await tx.update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, id));
        if (terminate) {
          await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
          await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "people.access.remove", resourceType: "user", resourceId: id, outcome: "success", correlationId: correlationId ?? null });
        }
        const profile = current.profile;
        await tx.insert(peopleProfiles).values({ userId: id, jobTitle: input.jobTitle === undefined ? profile.jobTitle : input.jobTitle ?? null, employmentStatus: input.employmentStatus ?? profile.employmentStatus, managerUserId: input.managerUserId === undefined ? profile.managerUserId : input.managerUserId ?? null }).onConflictDoUpdate({ target: peopleProfiles.userId, set: { jobTitle: input.jobTitle === undefined ? profile.jobTitle : input.jobTitle ?? null, employmentStatus: input.employmentStatus ?? profile.employmentStatus, managerUserId: input.managerUserId === undefined ? profile.managerUserId : input.managerUserId ?? null, updatedAt: new Date() } });
        if (input.departmentIds) {
          await tx.delete(userDepartments).where(eq(userDepartments.userId, id));
          if (input.departmentIds.length) await tx.insert(userDepartments).values(input.departmentIds.map((departmentId) => ({ userId: id, departmentId, isPrimary: input.primaryDepartmentId ? departmentId === input.primaryDepartmentId : departmentId === input.departmentIds?.[0] })));
        }
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "people.profile.update", resourceType: "user", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { changedFields: Object.keys(input), departmentCount: input.departmentIds?.length } });
      });
      return (await getPerson(id, peopleScope(actor)))!;
    },
  };
}
