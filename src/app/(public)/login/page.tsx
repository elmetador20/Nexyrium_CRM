import Image from "next/image";
import { signIn } from "@/auth";
import { Briefcase, DollarSign, LayoutDashboard, Users } from "lucide-react";

export const instant = false;

const errorMessages: Record<string, string> = {
  AccessDenied: "This account is not invited or is inactive. Contact a Nexyrium administrator.",
  Configuration: "Authentication is not configured for this environment.",
  OAuthAccountNotLinked: "That Google account is not linked to an invited Nexyrium user.",
  Verification: "The authentication request could not be verified. Try again.",
  ServiceUnavailable: "We could not reach the Nexyrium database to check your access. This is usually a slow or restricted network — wait a moment and try again, or switch networks.",
};

function safeCallbackUrl(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; invited?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const errorMessage = params.error ? (errorMessages[params.error] ?? "Sign-in was not completed.") : null;

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex lg:flex-1 bg-surface relative overflow-hidden">
        <div className="absolute inset-0 bg-mint" />
        <div className="absolute inset-0 nx-grid-bg opacity-70" />
        
        <div className="relative flex h-full flex-col items-center justify-center p-12">
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-12">
              <Image src="/branding/official-logo.webp" alt="Nexyrium ? Turning ideas into impact" width={640} height={640} className="h-auto w-44 lg:w-56" />
            </div>
            
            <h1 className="text-4xl font-semibold text-text-primary leading-tight mb-6">
              Run your entire business from one calm place
            </h1>
            
            <p className="text-lg text-text-secondary leading-relaxed mb-12">
              Manage leads, projects, finance, and operations in one unified platform. 
              Built for teams that deliver exceptional client work.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={<LayoutDashboard className="h-5 w-5" />}
                title="Unified Dashboard"
                description="Real-time KPIs, pipeline health, and project status at a glance."
              />
              <FeatureCard
                icon={<Users className="h-5 w-5" />}
                title="Complete CRM"
                description="Leads, clients, deals, and activities with full audit trail."
              />
              <FeatureCard
                icon={<Briefcase className="h-5 w-5" />}
                title="Project Delivery"
                description="Tasks, timelines, and team collaboration built for consultancies."
              />
              <FeatureCard
                icon={<DollarSign className="h-5 w-5" />}
                title="Financial Control"
                description="Quotations, invoices, expenses, and accounting integration."
              />
            </div>
          </div>

          
        </div>
      </div>

      <div className="flex flex-1 lg:w-96 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <Image src="/branding/official-logo.webp" alt="Nexyrium ? Turning ideas into impact" width={640} height={640} className="h-auto w-44 lg:w-56" />
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h1 className="text-2xl font-semibold text-text-primary">Welcome back</h1>
              <p className="mt-2 text-text-secondary">Sign in to your Nexyrium workspace.</p>

              {params.invited === "1" && (
                <div className="mt-4 rounded-lg bg-success-light p-3 text-sm text-success" role="status">
                  Your invitation is ready. Continue with the invited Google account.
                </div>
              )}

              {errorMessage && (
                <div className="mt-4 rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">
                  {errorMessage}
                </div>
              )}

              <form action={signInWithGoogle} className="mt-6">
                <button
                  type="submit"
                  className="button-primary inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-medium"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-muted">
                Access is invite-only. Use the Google account associated with your Nexyrium invitation.
              </p>

              <p className="mt-4 text-center text-sm text-text-muted">
                Don&apos;t have an invitation?{" "}
                <a href="mailto:admin@nexyrium.com" className="font-medium text-primary hover:underline">
                  Contact an administrator
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center text-primary mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
    </div>
  );
}
