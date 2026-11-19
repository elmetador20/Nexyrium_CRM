import { signOut } from "@/auth";

export default function LogoutPage() {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-background px-6 py-24">
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">Sign out</h1>
        <p className="mt-3 text-sm text-text-secondary">End your Nexyrium OS session on this device.</p>
        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="button-primary w-full"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
