import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const authConfig = {
  providers: [
    Google({
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // This callback is intentionally authentication-only. Database-backed
    // active-user and permission checks happen close to protected data access.
    authorized: ({ auth }) => Boolean(auth),
  },
} satisfies NextAuthConfig;

export default authConfig;
