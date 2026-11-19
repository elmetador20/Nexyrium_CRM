import { redirect } from "next/navigation";

import { acceptInvitation, getInvitationPreview, InvitationError } from "@/lib/auth/invitations";

export const instant = false;

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const invitation = await getInvitationPreview(token);

  async function acceptInvitationAction() {
    "use server";

    try {
      await acceptInvitation(token);
      redirect("/login?invited=1");
    } catch (error) {
      if (error instanceof InvitationError) {
        redirect("/invite?error=invalid");
      }
      throw error;
    }
  }

  const hasError = params.error === "invalid" || !invitation;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-background px-6 py-24">
      <div className="card p-8">
        <p className="text-sm font-medium text-text-muted">Nexyrium Consultancy</p>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">Accept your invitation</h1>
        {hasError ? (
          <p className="mt-4 rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">
            This invitation is invalid, expired, or has already been used. Ask an administrator for a new invitation.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-text-secondary">
              This invitation is for <strong>{invitation.email}</strong> and expires on {invitation.expiresAt.toUTCString()}.
            </p>
            <form action={acceptInvitationAction} className="mt-6">
              <button
                type="submit"
                className="button-primary w-full"
              >
                Continue to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
