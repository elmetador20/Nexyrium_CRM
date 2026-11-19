import { requirePageActor } from "@/lib/authorization/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { NavigationProgress } from "@/components/layout/NavigationProgress";

export const instant = false;

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  const user = { name: actor.name, email: actor.email, avatar: actor.image };

  return (
    <div className="min-h-screen bg-background">
      <NavigationProgress />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar user={user} permissions={actor.permissions} />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-64">
        <TopBar user={user} permissions={actor.permissions} />
        <main id="main-content" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
