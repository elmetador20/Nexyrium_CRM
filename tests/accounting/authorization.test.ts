import { describe, expect, it } from "vitest";

import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import type { AuthorizationActor } from "@/lib/authorization/policy";

const financeActor: AuthorizationActor = { userId: "finance-user", email: "finance@example.com", name: "Finance", isActive: true, roles: [ROLE_SLUGS.FINANCE], permissions: [PERMISSIONS.EXPENSES_APPROVE, PERMISSIONS.EXPENSES_REJECT, PERMISSIONS.ACCOUNTING_POST, PERMISSIONS.ACCOUNTING_REVERSE, PERMISSIONS.ACCOUNTING_PERIOD_CLOSE, PERMISSIONS.ACCOUNTING_RECONCILE], departmentIds: ["finance-department"] };
const auditor: AuthorizationActor = { ...financeActor, roles: [ROLE_SLUGS.READ_ONLY_AUDITOR], permissions: [PERMISSIONS.EXPENSES_READ, PERMISSIONS.ACCOUNTING_READ] };

describe("accounting authorization", () => {
  it("allows finance workflow actions but not self-approval by default", () => {
    expect(can(financeActor, PERMISSIONS.EXPENSES_APPROVE)).toBe(true);
    expect(can(financeActor, PERMISSIONS.ACCOUNTING_POST)).toBe(true);
    expect(can(financeActor, PERMISSIONS.EXPENSES_APPROVE_OWN)).toBe(false);
  });

  it("keeps auditors read-only", () => {
    expect(can(auditor, PERMISSIONS.EXPENSES_READ)).toBe(true);
    expect(can(auditor, PERMISSIONS.ACCOUNTING_READ)).toBe(true);
    expect(can(auditor, PERMISSIONS.ACCOUNTING_POST)).toBe(false);
    expect(can(auditor, PERMISSIONS.ACCOUNTING_RECONCILE)).toBe(false);
  });
});
