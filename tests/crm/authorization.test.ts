import { describe, expect, it } from "vitest";

import { can, canAccessRecord, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const sales: AuthorizationActor = {
  userId: "sales-user",
  email: "sales@example.com",
  name: "Sales",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [PERMISSIONS.CRM_LEADS_READ, PERMISSIONS.CRM_LEADS_CREATE, PERMISSIONS.CRM_LEADS_UPDATE],
  departmentIds: ["sales-department"],
};

describe("CRM authorization", () => {
  it("rejects inactive and unauthenticated actors", () => {
    expect(can(null, PERMISSIONS.CRM_LEADS_READ)).toBe(false);
    expect(can({ ...sales, isActive: false }, PERMISSIONS.CRM_LEADS_READ)).toBe(false);
  });

  it("allows permitted sales access and rejects unrelated permissions", () => {
    expect(can(sales, PERMISSIONS.CRM_LEADS_READ)).toBe(true);
    expect(can(sales, PERMISSIONS.CRM_DEALS_DELETE)).toBe(false);
  });

  it("prevents cross-owner access for ordinary CRM users", () => {
    expect(canAccessRecord(sales, PERMISSIONS.CRM_LEADS_READ, { ownerUserId: "sales-user" }, "owner")).toBe(true);
    expect(canAccessRecord(sales, PERMISSIONS.CRM_LEADS_READ, { ownerUserId: "other-user" }, "owner")).toBe(false);
  });

  it("allows department leads only within their departments", () => {
    const lead: AuthorizationActor = { ...sales, roles: [ROLE_SLUGS.DEPARTMENT_LEAD], permissions: [PERMISSIONS.CRM_LEADS_READ] };
    expect(canAccessRecord(lead, PERMISSIONS.CRM_LEADS_READ, { departmentId: "sales-department" }, "department")).toBe(true);
    expect(canAccessRecord(lead, PERMISSIONS.CRM_LEADS_READ, { departmentId: "finance-department" }, "department")).toBe(false);
  });

  it("allows auditors to read globally but not mutate", () => {
    const auditor: AuthorizationActor = { ...sales, roles: [ROLE_SLUGS.READ_ONLY_AUDITOR], permissions: [PERMISSIONS.CRM_LEADS_READ] };
    expect(canAccessRecord(auditor, PERMISSIONS.CRM_LEADS_READ, { ownerUserId: "other-user" }, "global")).toBe(true);
    expect(can(auditor, PERMISSIONS.CRM_LEADS_UPDATE)).toBe(false);
  });
});
