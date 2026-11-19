import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-24">
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Your account is authenticated, but it does not have permission for this resource.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium underline underline-offset-4">
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
