"use client";

import symbol from "@/features/branding/symbol.png";
import wordmark from "@/features/branding/wordmark.png";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity, BarChart3, Briefcase, CheckSquare, Contact, FileSignature, FileText, FolderKanban, Handshake,
  LayoutDashboard, LogOut, Menu, Plug, ReceiptText, Settings, Target, TrendingUp, UserPlus, Users, UserCog, X, Banknote, KanbanSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";

export interface NavItem { label: string; href: string; icon: ReactNode; permission?: string; match?: string[]; exact?: boolean }
export interface NavSection { title: string; items: NavItem[] }
export interface SidebarProps { user: { name?: string | null; email: string; avatar?: string | null }; navigation?: NavSection[]; permissions?: string[] }

const icon = (Node: typeof Users) => <Node className="h-[18px] w-[18px]" strokeWidth={1.8} />;

export const navigationSections: NavSection[] = [
  { title: "", items: [{ label: "Overview", href: "/dashboard", icon: icon(LayoutDashboard), permission: "reports:read", exact: true }] },
  {
    title: "CRM",
    items: [
      { label: "Leads", href: "/crm/leads", icon: icon(UserPlus), permission: "crm:leads:read" },
      { label: "Clients", href: "/crm/clients", icon: icon(Users), permission: "crm:clients:read" },
      { label: "Contacts", href: "/crm/contacts", icon: icon(Contact), permission: "crm:clients:read" },
      { label: "Pipeline", href: "/crm/pipeline", icon: icon(KanbanSquare), permission: "crm:deals:read" },
      { label: "Deals", href: "/crm/deals", icon: icon(Handshake), permission: "crm:deals:read" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Revenue", href: "/finance", icon: icon(TrendingUp), permission: "finance:read", exact: true },
      { label: "Invoices", href: "/finance/invoices", icon: icon(FileText), permission: "invoices:read" },
      { label: "Payments", href: "/finance/payments", icon: icon(Banknote), permission: "payments:read" },
      { label: "Expenses", href: "/expenses", icon: icon(ReceiptText), permission: "expenses:read" },
      { label: "Quotations", href: "/quotations", icon: icon(FileSignature), permission: "quotations:read" },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Tasks", href: "/tasks", icon: icon(CheckSquare), permission: "tasks:read" },
      { label: "Projects", href: "/projects", icon: icon(FolderKanban), permission: "projects:read" },
      { label: "Activities", href: "/activities", icon: icon(Activity), permission: "audit_logs:read" },
      { label: "Documents", href: "/documents", icon: icon(Briefcase), permission: "documents:read" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: icon(BarChart3), permission: "reports:read" },
      { label: "Targets", href: "/targets", icon: icon(Target), permission: "reports:read" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "People", href: "/people", icon: icon(UserCog), permission: "people:read" },
      { label: "Integrations", href: "/settings/integrations", icon: icon(Plug), permission: "settings:read" },
      { label: "Settings", href: "/settings", icon: icon(Settings), permission: "settings:read", exact: true },
    ],
  },
];

function hasPermission(userPermissions: string[], permission?: string) {
  if (!permission) return true;
  return userPermissions.includes("*") || userPermissions.includes(permission);
}

export function Sidebar({ user, navigation = navigationSections, permissions = [] }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = navigation
    .map((section) => ({ ...section, items: section.items.filter((item) => hasPermission(permissions, item.permission)) }))
    .filter((section) => section.items.length > 0);

  // Close the drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMobileOpen(false); }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-50 grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-text-secondary shadow-sm lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? <div className="fixed inset-0 z-40 bg-[#18231F]/40 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-mint transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="NEXYRIUM home">
            <Image src={symbol} alt="" width={40} height={33} priority />
            <Image src={wordmark} alt="Nexyrium" width={100} height={24} priority />
          </Link>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-hover lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-4 w-4" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Main">
          {sections.map((section, index) => (
            <div key={section.title || index} className={index ? "mt-5" : "mt-1"}>
              {section.title ? <p className="px-2.5 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-text-muted">{section.title}</p> : null}
              <ul className="space-y-0.5" role="list">
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[0.45rem] text-[0.875rem] font-medium transition-colors",
                          active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                        )}
                      >
                        {active ? <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" aria-hidden /> : null}
                        <span className={cn("shrink-0", active ? "text-primary" : "text-text-muted group-hover:text-text-secondary")} aria-hidden>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <Link href="/settings/profile" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md hover:opacity-90" aria-label="Your profile">
              <Avatar src={user.avatar} name={user.name || user.email.split("@")[0]} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">{user.name || user.email.split("@")[0]}</span>
                <span className="block truncate text-xs text-text-muted">{user.email}</span>
              </span>
            </Link>
            <Link href="/logout" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-danger-light hover:text-danger" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></Link>
          </div>
        </div>
      </aside>
    </>
  );
}
