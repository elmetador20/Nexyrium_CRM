import { describe, expect, it } from "vitest";

import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import { peopleScope } from "@/features/people/scope";
import { targetScope } from "@/features/targets/scope";

const base: AuthorizationActor = { userId: "user-1", email: "user@example.com", name: "User", isActive: true, roles: [], permissions: [], departmentIds: ["dept-1"] };

describe("Module 10 authorization", () => {
  it("keeps report access separate from target management", () => {
    const sales = { ...base, roles: [ROLE_SLUGS.SALES], permissions: [PERMISSIONS.REPORTS_READ] };
    const finance = { ...base, roles: [ROLE_SLUGS.FINANCE], permissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_MANAGE] };
    expect(can(sales, PERMISSIONS.REPORTS_READ)).toBe(true);
    expect(can(sales, PERMISSIONS.REPORTS_MANAGE)).toBe(false);
    expect(can(finance, PERMISSIONS.REPORTS_MANAGE)).toBe(true);
  });

  it("keeps people management restricted to authorized roles", () => {
    const directory = { ...base, roles: [ROLE_SLUGS.DEPARTMENT_LEAD], permissions: [PERMISSIONS.PEOPLE_READ] };
    const hr = { ...base, roles: [ROLE_SLUGS.PEOPLE_HR], permissions: [PERMISSIONS.PEOPLE_READ, PERMISSIONS.PEOPLE_MANAGE] };
    expect(can(directory, PERMISSIONS.PEOPLE_READ)).toBe(true);
    expect(can(directory, PERMISSIONS.PEOPLE_MANAGE)).toBe(false);
    expect(can(hr, PERMISSIONS.PEOPLE_MANAGE)).toBe(true);
    expect(peopleScope(directory).kind).toBe("department");
    expect(peopleScope(hr).kind).toBe("global");
  });

  it("does not give auditors target write access", () => {
    const auditor = { ...base, roles: [ROLE_SLUGS.READ_ONLY_AUDITOR], permissions: [PERMISSIONS.REPORTS_READ] };
    expect(targetScope(auditor).kind).toBe("global");
    expect(can(auditor, PERMISSIONS.REPORTS_MANAGE)).toBe(false);
  });
});
