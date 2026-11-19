import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      internalUserId?: string;
      roles: string[];
      permissions: string[];
      departmentIds: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    internalUserId?: string;
    roles?: string[];
    permissions?: string[];
    departmentIds?: string[];
    authInvalid?: boolean;
  }
}
