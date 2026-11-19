import { describe, expect, it } from "vitest";

import { can, canAccessRecord, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const salesActor: AuthorizationActor = {
  userId: "user-sales",
  email: "sales@example.com",
  name: "Sales User",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [PERMISSIONS.CRM_LEADS_READ, PERMISSIONS.CRM_LEADS_UPDATE],
  departmentIds: ["department-sales"],
};

describe("authorization policy", () => {
  it("rejects unauthenticated access", () => {
    expect(can(null, PERMISSIONS.CRM_LEADS_READ)).toBe(false);
  });

  it("rejects an authenticated role without the requested permission", () => {
    expect(can(salesActor, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });

  it("allows a role with the requested permission", () => {
    expect(can(salesActor, PERMISSIONS.CRM_LEADS_READ)).toBe(true);
  });

  it("enforces owner scope for self-scoped records", () => {
    expect(
      canAccessRecord(salesActor, PERMISSIONS.CRM_LEADS_READ, { ownerUserId: "user-sales" }, "owner"),
    ).toBe(true);
    expect(
      canAccessRecord(salesActor, PERMISSIONS.CRM_LEADS_READ, { ownerUserId: "other-user" }, "owner"),
    ).toBe(false);
  });

  it("enforces department scope without allowing cross-department access", () => {
    const departmentLead: AuthorizationActor = {
      ...salesActor,
      roles: [ROLE_SLUGS.DEPARTMENT_LEAD],
      permissions: [PERMISSIONS.PROJECTS_READ],
    };

    expect(
      canAccessRecord(departmentLead, PERMISSIONS.PROJECTS_READ, { departmentId: "department-sales" }, "department"),
    ).toBe(true);
    expect(
      canAccessRecord(departmentLead, PERMISSIONS.PROJECTS_READ, { departmentId: "department-finance" }, "department"),
    ).toBe(false);
  });

  it("allows read-only auditors to read globally but not mutate", () => {
    const auditor: AuthorizationActor = {
      ...salesActor,
      roles: [ROLE_SLUGS.READ_ONLY_AUDITOR],
      permissions: [PERMISSIONS.AUDIT_LOGS_READ],
    };

    expect(canAccessRecord(auditor, PERMISSIONS.AUDIT_LOGS_READ, { ownerUserId: "other-user" }, "global")).toBe(true);
    expect(can(auditor, PERMISSIONS.AUDIT_LOGS_EXPORT)).toBe(false);
  });
});
